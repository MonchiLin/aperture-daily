import { db } from '../src/db/factory';
import { TaskQueue } from '../src/services/tasks/queue';
import { fetchAndStoreDailyWords } from '../src/services/dailyWords';
import { env } from '../config/env';
import { sql } from 'kysely';

/**
 * Shared Cron Execution Logic
 */

export async function runDailyWordFetch(taskDate: string, logPrefix: string) {
    // 1. Fetch Words (if not exists)
    const existing = await db.selectFrom('daily_word_references')
        .select(sql<number>`count(*)`.as('c'))
        .where('date', '=', taskDate)
        .executeTakeFirst();

    const count = existing?.c || 0;

    if (count === 0) {
        console.log(`${logPrefix} Fetching words for ${taskDate}`);
        const cookie = env.SHANBAY_COOKIE;
        if (!cookie) throw new Error("Missing SHANBAY_COOKIE in .env");
        await fetchAndStoreDailyWords(db, { taskDate, shanbayCookie: cookie });
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
