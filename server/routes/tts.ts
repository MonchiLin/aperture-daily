import { Elysia, t } from 'elysia';
import { EdgeTTS } from 'edge-tts-universal';
import { db } from '../src/db/factory';
import type { Context } from 'elysia';

/**
 * TTS (Text-to-Speech) Proxy Service
 */

// Helper: Remove Markdown
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

export const ttsRoutes = new Elysia({ prefix: '/api/tts' })
    .get('/', async ({ query, set }: Context<{ query: TTSQuery }>) => {
        const { text, voice, articleId, level } = query;
        const speed = query.rate || '1.0';

        let textToSpeak = text;

        if (articleId && level) {
            try {
                const row = await db.selectFrom('article_variants')
                    .select(['content'])
                    .where('article_id', '=', articleId)
                    .where('level', '=', parseInt(level))
                    .executeTakeFirst();

                if (row && row.content) {
                    textToSpeak = cleanMarkdown(row.content);
                } else {
                    console.error("[TTS Proxy] Article variant has no content or not found");
                    set.status = 404;
                    return "Article variant not found or empty";
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
            set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';

            const selectedVoice = voice || "en-US-GuyNeural";
            const speedNum = parseFloat(speed) || 1.0;
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
