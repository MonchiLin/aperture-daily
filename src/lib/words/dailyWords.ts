import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../../db/schema';
import { dailyWords, words, wordLearningRecords } from '../../../db/schema';
import { fetchShanbayTodayWords } from '../shanbay';
import { applyShanbaySrsSync } from '../srs';

type Db = DrizzleD1Database<typeof schema>;

function uniqueStrings(input: string[]) {
	return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

export async function fetchAndStoreDailyWords(
	db: Db,
	args: {
		taskDate: string;
		shanbayCookie: string;
	}
) {
	const shanbay = await fetchShanbayTodayWords(args.shanbayCookie);
	const newWords = uniqueStrings(shanbay.newWords ?? []);
	const reviewWords = uniqueStrings(shanbay.reviewWords ?? []);
	const total = newWords.length + reviewWords.length;
	if (total === 0) {
		throw new Error('No words found from Shanbay.');
	}

	const now = new Date().toISOString();
	await db
		.insert(dailyWords)
		.values({
			date: args.taskDate,
			newWordsJson: JSON.stringify(newWords),
			reviewWordsJson: JSON.stringify(reviewWords),
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: dailyWords.date,
			set: {
				newWordsJson: JSON.stringify(newWords),
				reviewWordsJson: JSON.stringify(reviewWords),
				updatedAt: now
			}
		});

	// Upsert words + word_learning_records
	const allWords = [...new Set([...newWords, ...reviewWords])];
	const WORD_INSERT_CHUNK_SIZE = 20;
	const RECORD_INSERT_CHUNK_SIZE = 10;

	for (let i = 0; i < allWords.length; i += WORD_INSERT_CHUNK_SIZE) {
		const chunk = allWords.slice(i, i + WORD_INSERT_CHUNK_SIZE);
		await db
			.insert(words)
			.values(chunk.map((w) => ({ word: w, origin: 'shanbay' as const })))
			.onConflictDoNothing();
	}

	for (let i = 0; i < allWords.length; i += RECORD_INSERT_CHUNK_SIZE) {
		const chunk = allWords.slice(i, i + RECORD_INSERT_CHUNK_SIZE);
		await db
			.insert(wordLearningRecords)
			.values(chunk.map((w) => ({ word: w })))
			.onConflictDoNothing();
	}

	const srsSync = await applyShanbaySrsSync(db, { taskDate: args.taskDate, words: allWords });

	return {
		taskDate: args.taskDate,
		newCount: newWords.length,
		reviewCount: reviewWords.length,
		srsSync
	};
}
