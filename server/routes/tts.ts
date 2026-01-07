import { Elysia, t } from 'elysia';
import { EdgeTTS } from 'edge-tts-universal';
import { db } from '../src/db/client';
import { articleVariants } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import type { Context } from 'elysia';

// Helper to remove markdown symbols for cleaner TTS
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

        // Mode 1: Fetch from Article DB
        if (articleId && level) {
            console.log(`[TTS Proxy] Querying articleId=${articleId}, level=${level}`);
            try {
                const results = await db.select()
                    .from(articleVariants)
                    .where(and(
                        eq(articleVariants.articleId, articleId),
                        eq(articleVariants.level, parseInt(level))
                    ))
                    .limit(1);

                console.log(`[TTS Proxy] DB returned ${results.length} row(s)`);
                if (results.length > 0 && results[0]) {
                    const row = results[0];
                    console.log(`[TTS Proxy] Row keys: ${Object.keys(row).join(', ')}`);
                    console.log(`[TTS Proxy] content type: ${typeof row.content}, length: ${row.content?.length || 'N/A'}`);

                    if (row.content && typeof row.content === 'string') {
                        textToSpeak = cleanMarkdown(row.content);
                        console.log(`[TTS Proxy] Text prepared, length: ${textToSpeak.length}`);
                    } else {
                        console.error("[TTS Proxy] DB returned row with missing/invalid content:", JSON.stringify(row).slice(0, 200));
                        set.status = 400;
                        return `Content missing in DB row. Keys: ${Object.keys(row).join(', ')}`;
                    }
                } else {
                    console.log(`[TTS Proxy] No variant found for articleId=${articleId}, level=${level}`);
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
            console.log(`[TTS Proxy] No text provided. articleId=${articleId}, level=${level}, text=${text?.slice(0, 50)}`);
            set.status = 400;
            return "Content is required (provide 'text' OR 'articleId'+'level')";
        }

        try {
            // Cache control for 1 year (immutable)
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
