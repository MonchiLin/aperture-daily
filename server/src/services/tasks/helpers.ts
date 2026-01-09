import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import type { CandidateWord } from '../llm/utils';

export function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

/**
 * Get words that have already been used in articles today
 */
export async function getUsedWordsToday(db: AppDatabase, taskDate: string): Promise<Set<string>> {
    const rows = await db.all(sql`
        SELECT DISTINCT v.word 
        FROM tasks t
        JOIN articles a ON a.generation_task_id = t.id
        JOIN article_vocabulary v ON v.article_id = a.id
        WHERE t.task_date = ${taskDate}
    `) as { word: string }[];

    return new Set(rows.map(r => r.word));
}

/**
 * Get recent article titles to avoid topic repetition
 */
export async function getRecentTitles(db: AppDatabase, taskDate: string, days: number = 3): Promise<string[]> {
    const rows = await db.all(sql`
        SELECT DISTINCT a.title
        FROM tasks t
        JOIN articles a ON a.generation_task_id = t.id
        WHERE t.status = 'succeeded'
        AND t.task_date >= date(${taskDate}, '-' || ${days} || ' days')
        AND t.task_date < ${taskDate}
    `) as { title: string }[];

    return rows.map(r => r.title).filter(Boolean);
}

/**
 * Build candidate words for article generation.
 */
export function buildCandidateWords(
    newWords: string[],
    reviewWords: string[],
    usedWords: Set<string>
): CandidateWord[] {
    const allWords = uniqueStrings([...newWords, ...reviewWords]).filter((w) => !usedWords.has(w));
    if (allWords.length === 0) return [];

    const newWordSet = new Set(newWords);
    const candidates: CandidateWord[] = [];

    for (const word of allWords) {
        const type = newWordSet.has(word) ? 'new' : 'review';
        candidates.push({ word, type });
    }

    candidates.sort((a, b) => {
        if (a.type === 'new' && b.type !== 'new') return -1;
        if (a.type !== 'new' && b.type === 'new') return 1;
        return 0;
    });

    return candidates;
}
