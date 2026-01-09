import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { TaskQueue } from '../src/services/tasks/queue';
import { fetchAndStoreDailyWords } from '../src/services/dailyWords';
import { env } from '../config/env';

/**
 * Shared Cron Execution Logic
 * 
 * This logic is used by both:
 * - Internal cron scheduler (workers/cronScheduler.ts)
 * - Manual API trigger (routes/cron.ts)
 */

export async function runDailyWordFetch(taskDate: string, logPrefix: string) {
    // 1. Fetch Words (if not exists)
    const existingWords = await db.all(sql`SELECT count(*) as c FROM daily_word_references WHERE date = ${taskDate}`) as Array<{ c: number }>;
    if ((existingWords[0]?.c || 0) === 0) {
        console.log(`${logPrefix} Fetching words for ${taskDate}`);
        const cookie = env.SHANBAY_COOKIE;
        if (!cookie) throw new Error("Missing SHANBAY_COOKIE in .env");
        await fetchAndStoreDailyWords(db as any, { taskDate, shanbayCookie: cookie });
        return { status: "fetched" };
    } else {
        console.log(`${logPrefix} Words already exist for ${taskDate}`);
        return { status: "skipped" };
    }
}

export async function runTaskEnqueue(taskDate: string, logPrefix: string, queue: TaskQueue) {
    // 2. Enqueue Task
    console.log(`${logPrefix} Enqueuing tasks for ${taskDate}`);
    const tasks = await queue.enqueue(taskDate, 'cron');
    return { status: "ok", tasks };
}

/**
 * Shared Cron Execution Logic
 * 
 * Maintained for backward compatibility (API trigger)
 */
export async function executeCronLogic(
    taskDate: string,
    logPrefix: string,
    queue: TaskQueue
) {
    try {
        await runDailyWordFetch(taskDate, logPrefix);
        return await runTaskEnqueue(taskDate, logPrefix, queue);
    } catch (e: any) {
        console.error(`${logPrefix} Error:`, e);
        throw e;
    }
}
