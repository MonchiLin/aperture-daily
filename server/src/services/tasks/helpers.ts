/**
 * 任务辅助函数
 *
 * 提供任务执行过程中的通用工具函数，主要用于候选词构建和去重。
 */

import { sql } from 'kysely';
import type { AppKysely } from '../../db/factory';
import type { CandidateWord } from '../llm/utils';

/** 字符串数组去重，同时过滤掉空值 */
export function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

/**
 * 获取当日已被文章使用的词汇
 *
 * 用途：避免同一天多个文章使用相同的词，确保词汇覆盖面
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
 * 获取近期文章标题
 *
 * 用途：传递给 LLM 避免生成重复主题的文章
 * 默认取最近 3 天，防止用户连续几天看到相似内容
 */
export async function getRecentTitles(db: AppKysely, taskDate: string, days: number = 3): Promise<string[]> {
    const rows = await db.selectFrom('tasks')
        .innerJoin('articles', 'articles.generation_task_id', 'tasks.id')
        .select('articles.title')
        .distinct()
        .where('tasks.status', '=', 'succeeded')
        .where('tasks.task_date', '<', taskDate)
        // SQLite 日期计算语法
        .where(sql<boolean>`task_date >= date(${taskDate}, '-' || ${days} || ' days')`)
        .execute();

    return rows.map(r => r.title).filter(Boolean);
}

/**
 * 构建候选词列表
 *
 * 策略：
 * 1. 合并新词和复习词，去重
 * 2. 过滤掉已被今日其他文章使用的词
 * 3. 按类型排序：新词优先（确保新学词汇得到练习）
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

    // 新词排在前面，优先被 LLM 选中
    candidates.sort((a, b) => {
        if (a.type === 'new' && b.type !== 'new') return -1;
        if (a.type !== 'new' && b.type === 'new') return 1;
        return 0;
    });

    return candidates;
}

