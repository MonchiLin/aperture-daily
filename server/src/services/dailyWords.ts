import type { AppDatabase } from '../db/client';
import { words, dailyWordReferences } from '../../db/schema';
import { fetchShanbayTodayWords } from './shanbay';
import { sql } from 'drizzle-orm';

/**
 * Utility: Filter unique non-empty strings
 * 用于清洗单词列表，去除空值和重复项。
 */
function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

// 简单的延时函数，用于通过 Rate Limiting (速率限制)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchAndStoreDailyWords(
    db: AppDatabase,
    args: {
        taskDate: string;
        shanbayCookie: string;
    }
) {
    const shanbay = await fetchShanbayTodayWords(args.shanbayCookie);
    if (!Array.isArray(shanbay.newWords) || !Array.isArray(shanbay.reviewWords)) {
        throw new Error('Shanbay: invalid word payload');
    }
    const newWords = uniqueStrings(shanbay.newWords);
    const reviewWords = uniqueStrings(shanbay.reviewWords);
    const total = newWords.length + reviewWords.length;
    if (total === 0) {
        // 快速失败：空词表视为今日未学习。
        throw new Error('No words found from Shanbay.');
    }




    // 写入 words 表 (Global Dictionary)
    // 策略：Idempotent Write (幂等写入)
    // 我们使用 `onConflictDoNothing()`，意味着如果单词已存在，则忽略。
    // 这保证了单词表是全局唯一的单词集合，不会重复。
    const allWords = [...new Set([...newWords, ...reviewWords])];

    // [D1 / SqliteProxy 限制]
    // Cloudflare D1 HTTP API 对 SQL 语句长度和变量数量有严格限制。
    // 如果一次插入几百个单词，会触发 "Topic too large" 或 "Too many SQL variables" 错误。
    // 解决方案：将大任务切分为小 Chunk (Size=10)，并增加微小的 sleep 避免触发 Rate Limit。
    const WORD_INSERT_CHUNK_SIZE = 10;

    for (let i = 0; i < allWords.length; i += WORD_INSERT_CHUNK_SIZE) {
        const chunk = allWords.slice(i, i + WORD_INSERT_CHUNK_SIZE);
        console.log(`[DailyWords] Inserting words chunk: ${i} - ${i + chunk.length} / ${allWords.length}`);
        await db
            .insert(words)
            .values(chunk.map((w) => ({ word: w, origin: 'shanbay' as const })))
            .onConflictDoNothing();

        // Rate Limiting: Sleep to avoid D1 "internal error" / rate limits
        await sleep(200);
    }

    // 写入 daily_word_references (每日引用表)
    // 策略：Reset & Rewrite (重置并重写)
    // 对于“今天”的任务，如果多次运行此函数，我们需要先清除旧的引用记录，确保数据与最新的扇贝记录 1:1 一致。
    // 这也是为了支持“重新生成”或“修复”场景。
    // Delete existing references for this date to support idempotency/updates
    await db.delete(dailyWordReferences).where(sql`${dailyWordReferences.date} = ${args.taskDate}`);

    const references = [
        ...newWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'new' as const })),
        ...reviewWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'review' as const }))
    ];

    const REF_CHUNK = 10;
    for (let i = 0; i < references.length; i += REF_CHUNK) {
        console.log(`[DailyWords] Inserting references chunk: ${i} - ${Math.min(i + REF_CHUNK, references.length)} / ${references.length}`);
        await db.insert(dailyWordReferences).values(references.slice(i, i + REF_CHUNK)).onConflictDoNothing();

        // Rate Limiting: Sleep to avoid D1 "internal error" / rate limits
        await sleep(200);
    }

    return {
        taskDate: args.taskDate,
        newCount: newWords.length,
        reviewCount: reviewWords.length
    };
}
