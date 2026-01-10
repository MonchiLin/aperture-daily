import { sql } from 'kysely';
import type { AppKysely } from '../../db/factory';
import type { CandidateWord } from '../llm/utils';

export function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

/**
 * Get words that have already been used in articles today
 */
export async function getUsedWordsToday(db: AppKysely, taskDate: string): Promise<Set<string>> {
    const rows = await db.selectFrom('tasks')
        .innerJoin('articles', 'articles.generation_task_id', 'tasks.id')
        .innerJoin('article_vocabulary', 'article_vocabulary.article_id', 'articles.id')
        .select('article_vocabulary.word')
        .distinct()
        .where('tasks.task_date', '=', taskDate)
        .execute();

    return new Set(rows.map(r => r.word));
}

/**
 * Get recent article titles to avoid topic repetition
 */
export async function getRecentTitles(db: AppKysely, taskDate: string, days: number = 3): Promise<string[]> {
    const rows = await db.selectFrom('tasks')
        .innerJoin('articles', 'articles.generation_task_id', 'tasks.id')
        .select('articles.title')
        .distinct()
        .where('tasks.status', '=', 'succeeded')
        .where('tasks.task_date', '<', taskDate)
        // SQLite date arithmetic
        .where(sql<boolean>`task_date >= date(${taskDate}, '-' || ${days} || ' days')`)
        .execute();

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
