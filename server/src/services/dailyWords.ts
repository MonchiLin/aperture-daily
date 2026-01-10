import type { AppKysely } from '../db/factory';
import { fetchShanbayTodayWords } from './shanbay';

/**
 * Utility: Filter unique non-empty strings
 */
function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchAndStoreDailyWords(
    db: AppKysely,
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

    // NOTE: The user might have 0 words if they completed everything or haven't learned.
    // Throwing error stops the process as per business logic.
    if (newWords.length + reviewWords.length === 0) {
        throw new Error('No words found from Shanbay.');
    }

    const allWords = [...new Set([...newWords, ...reviewWords])];

    // Chunking to avoid D1 limits
    const WORD_INSERT_CHUNK_SIZE = 50; // Use reasonable chunk size, Kysely handles it well, but D1 has param limit ~100. 10 * columns.

    for (let i = 0; i < allWords.length; i += WORD_INSERT_CHUNK_SIZE) {
        const chunk = allWords.slice(i, i + WORD_INSERT_CHUNK_SIZE);
        console.log(`[DailyWords] Inserting words chunk: ${i} - ${i + chunk.length} / ${allWords.length}`);

        await db.insertInto('words')
            .values(chunk.map((w) => ({ word: w, origin: 'shanbay' })))
            .onConflict((oc) => oc.doNothing())
            .execute();

        await sleep(100);
    }

    // Reset references for the date
    await db.deleteFrom('daily_word_references')
        .where('date', '=', args.taskDate)
        .execute();

    const references = [
        ...newWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'new' as const })),
        ...reviewWords.map(w => ({ id: crypto.randomUUID(), date: args.taskDate, word: w, type: 'review' as const }))
    ];

    const REF_CHUNK = 20; // 5 columns * 20 = 100 vars. D1 limit is 100 on binding? HTTP limit is higher.
    // D1 binding batch limit is higher. 
    // Keep it conservative.
    for (let i = 0; i < references.length; i += REF_CHUNK) {
        console.log(`[DailyWords] Inserting references chunk: ${i} - ${Math.min(i + REF_CHUNK, references.length)} / ${references.length}`);

        await db.insertInto('daily_word_references')
            .values(references.slice(i, i + REF_CHUNK))
            .onConflict((oc) => oc.doNothing())
            .execute();

        await sleep(100);
    }

    return {
        taskDate: args.taskDate,
        newCount: newWords.length,
        reviewCount: reviewWords.length
    };
}
