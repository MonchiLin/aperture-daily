import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import { fetchAndStoreDailyWords } from '../src/services/dailyWords';
import { getBusinessDate } from '../src/lib/time';
import { env } from '../config/env';

import { AppError } from '../src/errors/AppError';

interface FetchBody { task_date?: string; date?: string; }

export const wordsRoutes = new Elysia({ prefix: '/api/words' })
    .post('/fetch', async ({ body }) => {
        const b = body as FetchBody;
        console.log("收到获取单词请求:", b);
        const date = b.task_date || b.date || getBusinessDate();
        const cookie = env.SHANBAY_COOKIE;

        console.log(`[Fetch Words] 使用环境变量 Cookie。长度: ${cookie.length}`);

        if (!cookie) {
            throw AppError.internal("环境变量中缺少 SHANBAY_COOKIE");
        }

        const result = await fetchAndStoreDailyWords(db, {
            taskDate: date,
            shanbayCookie: cookie
        });
        return { status: "ok", result };
    });
