import { Elysia, t } from 'elysia';
import { EdgeTTS } from 'edge-tts-universal';
import { db } from '../src/db/client';
import { articleVariants } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Helper to remove markdown symbols for cleaner TTS
// (Simple regex to remove common markdown like **, #, [], etc)
function cleanMarkdown(text: string): string {
    return text
        .replace(/[*#`_~[\]]/g, '') // Remove symbols
        .replace(/\(https?:\/\/[^\)]+\)/g, '') // Remove links
        .replace(/\n\s*\n/g, '\n'); // Collapse multiple newlines
}

export const ttsRoutes = new Elysia({ prefix: '/api/tts' })
    .get('/', async ({ query, set }: any) => {
        const { text, voice, articleId, level } = query;
        const speed = query.rate || '1.0';

        let textToSpeak = text;

        // Mode 1: Fetch from Article DB
        if (articleId && level) {
            try {
                const results = await db.select()
                    .from(articleVariants)
                    .where(and(
                        eq(articleVariants.articleId, articleId),
                        eq(articleVariants.level, parseInt(level))
                    ))
                    .limit(1);

                console.log("[TTS Proxy] DB results:", results);

                if (results.length > 0 && results[0]) {
                    const row = results[0];
                    if (row.content && typeof row.content === 'string') {
                        textToSpeak = cleanMarkdown(row.content);
                    } else {
                        console.error("[TTS Proxy] DB returned row with missing content:", row);
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
            // Cache control for 1 year (immutable)
            set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';

            const selectedVoice = voice || "en-US-GuyNeural";
            // Parse rate properly - handle "1", "1.0", "1.5", etc.
            const speedNum = parseFloat(speed) || 1.0;
            const ratePct = speedNum === 1.0 ? "+0%" : `${speedNum > 1 ? '+' : ''}${Math.round((speedNum - 1) * 100)}%`;

            const tts = new EdgeTTS(textToSpeak, selectedVoice, {
                rate: ratePct,
                volume: "+0%",
                pitch: "+0Hz"
            });

            // Set timeout for synthesis
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
        } catch (e: any) {
            console.error("[TTS Proxy] Error:", e);
            set.status = 500;
            return e.message || "Internal TTS Error";
        }
    }, {
        query: t.Object({
            text: t.Optional(t.String()),
            voice: t.Optional(t.String()),
            articleId: t.Optional(t.String()),
            level: t.Optional(t.String()), // Query params are strings
            rate: t.Optional(t.String())
        })
    });
