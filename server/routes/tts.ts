import { Elysia, t } from 'elysia';
import { EdgeTTS } from 'edge-tts-universal';
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';
import type { Context } from 'elysia';

/**
 * TTS (Text-to-Speech) Proxy Service
 * 
 * 架构背景：
 * 本项目使用 Edge-TTS 生成高质量语音，但这不在前端运行。
 * 因此，后端作为 TTS 代理，接收前端请求 -> 生成音频 -> 返回 Base64 音频数据。
 * 
 * 核心职责：
 * 1. 代理 EdgeTTS 调用。
 * 2. 文本清洗：Markdown 符号会破坏发音连贯性，必须预先清洗。
 * 3. 缓存策略：语音是不变资源 (Immutable)，通过 HTTP Header 指导浏览器永久缓存。
 */

// 辅助函数：移除 Markdown 符号以获得更干净的 TTS 发音
// 输入: "**Hello**, world!" -> "Hello, world!"
function cleanMarkdown(text: string): string {
    return text
        .replace(/[*#`_~[\]]/g, '')
        .replace(/\(https?:\/\/[^\)]+\)/g, '')
        .replace(/\n\s*\n/g, '\n');
}

interface TTSQuery {
    text?: string;
    voice?: string;
    articleId?: string;
    level?: string;
    rate?: string;
}

interface ArticleVariantRow {
    id: string;
    article_id: string;
    level: number;
    content: string | null;
}

export const ttsRoutes = new Elysia({ prefix: '/api/tts' })
    .get('/', async ({ query, set }: Context<{ query: TTSQuery }>) => {
        const { text, voice, articleId, level } = query;
        const speed = query.rate || '1.0';

        let textToSpeak = text;

        // 模式 1: 从文章数据库获取 (使用原生 SQL 以兼容 sqlite-proxy)
        if (articleId && level) {
            try {
                // [SQL 兼容性说明]
                // 为什么不使用 Drizzle Query Builder?
                // `drizzle-orm/sqlite-proxy` 驱动在处理 snake_case 列名映射到 camelCase 对象时存在严重 Bug (v0.29+)。
                // 导致 `db.select().from(...)` 返回 undefined 字段。
                // 
                // 解决方案：使用 `db.all(sql`...`)` 直接执行原始 SQL，这能绕过 Drizzle 的映射逻辑，也就是“Raw Mode”。
                // 这样我们可以确信返回的数据结构与 DB 表结构 1:1 一致。
                const results = await db.all(sql`
                    SELECT id, article_id, level, content 
                    FROM article_variants 
                    WHERE article_id = ${articleId} AND level = ${parseInt(level)}
                    LIMIT 1
                `) as ArticleVariantRow[];

                if (results.length > 0 && results[0]) {
                    const row = results[0];
                    if (row.content && typeof row.content === 'string') {
                        textToSpeak = cleanMarkdown(row.content);
                    } else {
                        console.error("[TTS Proxy] Article variant has no content");
                        set.status = 404;
                        return "Article variant has no content";
                    }
                } else {
                    set.status = 404;
                    return "Article variant not found";
                }
            } catch (e) {
                console.error("[TTS Proxy] DB Error:", e);
                set.status = 500;
                return "Database error fetching article";
            }
        }

        if (!textToSpeak) {
            set.status = 400;
            return "Content is required (provide 'text' OR 'articleId'+'level')";
        }

        try {
            // 缓存策略 (Cache Strategy)
            // 语音数据是大文件且生成昂贵。
            // 使用 `max-age=1year, immutable` 告诉 CDN 和浏览器：这个 URL 的内容永远不会变。
            // 只要参数 (text, voice) 不变，永远不需要重新请求。
            set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';

            const selectedVoice = voice || "en-US-GuyNeural";
            const speedNum = parseFloat(speed) || 1.0;
            // 速率转换：EdgeTTS 接受 "+10%" 或 "-10%" 格式，而非浮点数。
            const ratePct = speedNum === 1.0 ? "+0%" : `${speedNum > 1 ? '+' : ''}${Math.round((speedNum - 1) * 100)}%`;

            const tts = new EdgeTTS(textToSpeak, selectedVoice, {
                rate: ratePct,
                volume: "+0%",
                pitch: "+0Hz"
            });

            const result = await Promise.race([
                tts.synthesize(),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("TTS Timeout")), 20000)
                )
            ]);

            if (!result.audio) {
                set.status = 500;
                return "Failed to generate audio (No data)";
            }

            const buffer = await result.audio.arrayBuffer();
            const base64Audio = Buffer.from(buffer).toString('base64');

            return {
                audio: base64Audio,
                boundaries: result.subtitle || []
            };
        } catch (e) {
            const error = e as Error;
            console.error("[TTS Proxy] Error:", error);
            set.status = 500;
            return error.message || "Internal TTS Error";
        }
    }, {
        query: t.Object({
            text: t.Optional(t.String()),
            voice: t.Optional(t.String()),
            articleId: t.Optional(t.String()),
            level: t.Optional(t.String()),
            rate: t.Optional(t.String())
        })
    });
