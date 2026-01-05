import type { AppDatabase } from '../db/client';
import { words, dailyWordReferences } from '../../db/schema';
import { fetchShanbayTodayWords } from './shanbay';
import { sql } from 'drizzle-orm';

function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

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

    const now = new Date().toISOString();


    // 写入 words 表（幂等）
    const allWords = [...new Set([...newWords, ...reviewWords])];
    const WORD_INSERT_CHUNK_SIZE = 20;

    for (let i = 0; i < allWords.length; i += WORD_INSERT_CHUNK_SIZE) {
        const chunk = allWords.slice(i, i + WORD_INSERT_CHUNK_SIZE);
        await db
            .insert(words)
            .values(chunk.map((w) => ({ word: w, origin: 'shanbay' as const })))
            .onConflictDoNothing();
    }

    // 写入 daily_word_references (Normalized)
    // Delete existing references for this date to support idempotency/updates
    await db.delete(dailyWordReferences).where(sql`${dailyWordReferences.date} = ${args.taskDate}`);

    const references = [
        ...newWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'new' as const })),
        ...reviewWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'review' as const }))
    ];

    const REF_CHUNK = 50;
    for (let i = 0; i < references.length; i += REF_CHUNK) {
        await db.insert(dailyWordReferences).values(references.slice(i, i + REF_CHUNK)).onConflictDoNothing();
    }

    return {
        taskDate: args.taskDate,
        newCount: newWords.length,
        reviewCount: reviewWords.length
    };
}
