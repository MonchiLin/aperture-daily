import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import { fetchAndStoreDailyWords } from '../src/services/dailyWords';
import { getBusinessDate } from '../src/lib/time';
import { env } from '../config/env';

export const wordsRoutes = new Elysia({ prefix: '/api/words' })
    .post('/fetch', async ({ body }: { body: any }) => {
        console.log("Receive fetch words request:", body);
        const date = body.task_date || body.date || getBusinessDate();
        const cookie = env.SHANBAY_COOKIE;

        console.log(`[Fetch Words] Using Env Cookie. Length: ${cookie.length}`);

        if (!cookie) {
            return { status: "error", message: "Missing SHANBAY_COOKIE in .env" };
        }

        try {
            const result = await fetchAndStoreDailyWords(db as any, {
                taskDate: date,
                shanbayCookie: cookie
            });
            return { status: "ok", result };
        } catch (e: any) {
            console.error("Fetch words error:", e);
            return { status: "error", message: e.message };
        }
    });
