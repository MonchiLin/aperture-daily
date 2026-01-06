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
}

export interface WordMatchConfig {
    lemma: string;
    forms: string[];
}

/**
 * 加载文章数据
 */
export async function loadArticle(id: string): Promise<ArticleData | null> {
    let row: ArticleRow | null = null;
    let parsed: ArticleParsedContent = {};
    let sources: string[] = [];
    let wordDefinitions: WordDefinition[] = [];
    let sidebarWords: SidebarWord[] = [];
    let dateLabel = "";

    try {
        row = await apiFetch<ArticleRow>(`/api/articles/${id}`);
        if (row?.articles?.content_json) {
            parsed = parseArticleContent(row.articles.content_json);
            sources = extractSources(parsed);
            wordDefinitions = extractWordDefinitions(parsed);
            sidebarWords = mapToSidebarWords(wordDefinitions);
            dateLabel = formatDateLabel(row.tasks?.task_date);
        }
    } catch (e: any) {
        console.error("[SSR] Failed to fetch article:", e.message);
        return null;
    }

    const articles = parsed?.result?.articles || [];
    const sortedArticles = [...articles].sort((a, b) => a.level - b.level);
    const title = row?.articles?.title || "Article";
    const readLevels = row?.articles?.read_levels || 0;

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
    };
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
 * 预获取记忆数据 (SSR Batch)
 */
export async function fetchMemories(
    targetWords: string[],
    articleId: string,
    adminKey: string | undefined
): Promise<Record<string, unknown>> {
    if (targetWords.length === 0 || !adminKey) {
        return {};
    }

    try {
        const data = await apiFetch<{ memories?: Record<string, unknown> }>('/api/context/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminKey}`
            },
            body: JSON.stringify({
                words: targetWords,
                exclude_article_id: articleId
            })
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
