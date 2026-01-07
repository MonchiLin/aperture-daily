/**
 * Article Loader - 文章数据加载器
 * 
 * 集中处理文章数据的获取和解析逻辑
 */
import { apiFetch } from '../api';
import type { ArticleParsedContent, ArticleRow, ArticleLevelContent, WordDefinition, SidebarWord } from './types';
import {
    extractSources,
    extractWordDefinitions,
    formatDateLabel,
    mapToSidebarWords,
    parseArticleContent,
} from './utils';

export interface ArticleData {
    row: ArticleRow | null;
    parsed: ArticleParsedContent;
    sources: string[];
    wordDefinitions: WordDefinition[];
    sidebarWords: SidebarWord[];
    dateLabel: string;
    sortedArticles: ArticleLevelContent[];
    title: string;
    readLevels: number;
    memories: Record<string, unknown>;
}

export interface WordMatchConfig {
    lemma: string;
    forms: string[];
}

/**
 * 加载文章数据（包含并行获取 memories）
 */
export async function loadArticle(id: string): Promise<ArticleData | null> {
    try {
        // 并行请求文章数据和 memories
        const [articleRes, memoriesRes] = await Promise.all([
            apiFetch<ArticleRow>(`/api/articles/${id}`),
            apiFetch<{ memories?: Record<string, unknown> }>('/api/context/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ article_id: id })
            }).catch(() => ({ memories: {} }))
        ]);

        const row = articleRes;
        let parsed: ArticleParsedContent = {};
        let sources: string[] = [];
        let wordDefinitions: WordDefinition[] = [];
        let sidebarWords: SidebarWord[] = [];
        let dateLabel = "";

        if (row?.articles?.content_json) {
            parsed = parseArticleContent(row.articles.content_json);
            sources = extractSources(parsed);
            wordDefinitions = extractWordDefinitions(parsed);
            sidebarWords = mapToSidebarWords(wordDefinitions);
            dateLabel = formatDateLabel(row.tasks?.task_date);
        }

        const articles = parsed?.result?.articles || [];
        const sortedArticles = [...articles].sort((a, b) => a.level - b.level);
        const title = row?.articles?.title || "Article";
        const readLevels = row?.articles?.read_levels || 0;
        const memories = memoriesRes?.memories || {};

        return {
            row,
            parsed,
            sources,
            wordDefinitions,
            sidebarWords,
            dateLabel,
            sortedArticles,
            title,
            readLevels,
            memories,
        };
    } catch (e: any) {
        console.error("[SSR] Failed to fetch article:", e.message);
        return null;
    }
}

/**
 * 构建单词匹配配置 (用于形态学匹配)
 */
export function buildWordMatchConfigs(wordDefinitions: WordDefinition[]): WordMatchConfig[] {
    return wordDefinitions.map((w) => ({
        lemma: w.word.toLowerCase(),
        forms: [
            w.word.toLowerCase(),
            w.used_form ? w.used_form.toLowerCase() : w.word.toLowerCase()
        ].filter((v, i, a) => a.indexOf(v) === i) // Unique
    }));
}

/**
 * @deprecated Use loadArticle() which includes memories via parallel fetch
 */
export async function fetchMemories(
    _targetWords: string[],
    articleId: string,
    _adminKey: string | undefined
): Promise<Record<string, unknown>> {
    console.warn('[DEPRECATED] fetchMemories: Use loadArticle() instead');
    try {
        const data = await apiFetch<{ memories?: Record<string, unknown> }>('/api/context/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ article_id: articleId })
        });
        return data?.memories || {};
    } catch (e) {
        console.error("Failed to fetch memories:", e);
        return {};
    }
}

/**
 * 计算阅读统计
 */
export function getReadingStats(content: string): { wordCount: number; minutes: number } {
    const words = content?.trim().split(/\s+/).filter(Boolean) || [];
    const count = words.length;
    const minutes = count ? Math.max(1, Math.ceil(count / 120)) : 0;
    return { wordCount: count, minutes };
}

/**
 * 获取所有文章内容用于 AudioPlayer
 */
export function getAllArticleContents(sortedArticles: ArticleLevelContent[]): { level: number; content: string }[] {
    return sortedArticles.map((a) => ({
        level: a.level,
        content: a.content || ''
    }));
}
