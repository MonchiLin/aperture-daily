import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import { fetchAndStoreDailyWords } from '../src/services/dailyWords';
import { getBusinessDate } from '../src/lib/time';
import { env } from '../config/env';

interface FetchBody { task_date?: string; date?: string; }

export const wordsRoutes = new Elysia({ prefix: '/api/words' })
    .post('/fetch', async ({ body }) => {
        const b = body as FetchBody;
        console.log("Receive fetch words request:", b);
        const date = b.task_date || b.date || getBusinessDate();
        const cookie = env.SHANBAY_COOKIE;

        console.log(`[Fetch Words] Using Env Cookie. Length: ${cookie.length}`);

        if (!cookie) {
            return { status: "error", message: "Missing SHANBAY_COOKIE in .env" };
        }

        try {
            const result = await fetchAndStoreDailyWords(db, {
                taskDate: date,
                shanbayCookie: cookie
            });
            return { status: "ok", result };
        } catch (e) {
            console.error("Fetch words error:", e);
            return { status: "error", message: e instanceof Error ? e.message : 'Unknown error' };
        }
    });
