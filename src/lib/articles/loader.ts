/**
 * Article Loader (文章数据加载与注水层)
 * 
 * 核心职责：
 * 1. 数据聚合：从 SQLite 主表、Echoes 服务获取原始数据。
 * 2. 数据注水 (Hydration)：将原始 JSON 文本和稀疏数据转换为前端组件可直接消费的富对象 (ArticleData)。
 * 3. 性能优化：利用 Promise.all 并行请求核心数据和辅助数据 (Memories/Echoes)，减少首屏加载延迟。
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
    category?: string;
    echoes: Record<string, unknown>;
    /** 文章生成模式 */
    generationMode: 'rss' | 'impression';
}

export interface WordMatchConfig {
    lemma: string;
    forms: string[];
}

/**
 * 加载并组装完整的文章页面数据
 * 
 * 该函数实现了"瀑布流"式的并行加载策略：
 * - 关键路径 (Critical Path): 获取 ArticleRow (包含 JSON 内容)。
 * - 辅助路径 (Secondary): 获取 Echoes (关联记忆)。
 * 
 * 两者并行发起，但页面渲染强依赖 ArticleRow。Echoes 如果失败，会静默降级为空对象，不阻塞页面展示。
 */
export async function loadArticle(id: string): Promise<ArticleData | null> {
    try {
        // 并行请求文章数据和 echoes
        const [articleRes, echoesRes] = await Promise.all([
            apiFetch<ArticleRow>(`/api/articles/${id}`),
            apiFetch<{ echoes?: Record<string, unknown> }>('/api/echoes/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ article_id: id })
            }).catch(() => ({ echoes: {} }))
        ]);

        const echoes = echoesRes?.echoes || {};
        return processArticleData(articleRes, echoes);
    } catch (e: any) {
        console.error("[SSR] Failed to fetch article:", e.message);
        return null;
    }
}

/**
 * 构建高亮系统的形态学匹配配置
 * 
 * 将单词定义的 lemma (原形) 和 used_form (文中出现的变形) 组合，
 * 生成用于前端文本匹配的正则配置。
 * 
 * 例如：word="Run", used_form="running" -> ["run", "running"]
 */
export function buildWordMatchConfigs(wordDefinitions: WordDefinition[]): WordMatchConfig[] {
    return wordDefinitions.map((w) => ({
        lemma: w.word.toLowerCase(),
        forms: [
            w.word.toLowerCase(),
            w.usedForm ? w.usedForm.toLowerCase() : w.word.toLowerCase()
        ].filter((v, i, a) => a.indexOf(v) === i) // Unique
    }));
}

/**
 * @deprecated 请使用包含并行获取 memories 逻辑的 loadArticle() 替代
 */
export async function fetchEchoes(
    _targetWords: string[],
    articleId: string,
    _adminKey: string | undefined
): Promise<Record<string, unknown>> {
    console.warn('[DEPRECATED] fetchEchoes: Use loadArticle() instead');
    try {
        const data = await apiFetch<{ echoes?: Record<string, unknown> }>('/api/echoes/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ article_id: articleId })
        });
        return data?.echoes || {};
    } catch (e) {
        console.error("Failed to fetch echoes:", e);
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
 * 获取所有文章内容用于 AudioPlayer (包含 sentences)
 */
export function getAllArticleContents(sortedArticles: ArticleLevelContent[]) {
    return sortedArticles.map((a) => ({
        level: a.level,
        content: a.content || '',
        sentences: a.sentences || []
    }));
}

export async function loadArticleBySlug(date: string, slug: string): Promise<ArticleData | null> {
    try {
        const [articleRes] = await Promise.all([
            apiFetch<ArticleRow>(`/api/articles/lookup?date=${date}&slug=${slug}`),
            // Placeholder for parallel fetch if needed in future
            Promise.resolve(null)
        ]);

        if (!articleRes) return null;

        // Now fetch echoes using the ID from articleRes
        const articleId = articleRes.articles?.id;
        let echoes = {};
        if (articleId) {
            try {
                // Log the raw response to debug
                // console.log("[Loader] Raw Article Response:", JSON.stringify(articleRes, null, 2));

                const echoesData = await apiFetch<{ echoes?: Record<string, unknown> }>('/api/echoes/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ article_id: articleId })
                });
                echoes = echoesData?.echoes || {};
            } catch { }
        }

        return processArticleData(articleRes, echoes);
    } catch (e: any) {
        console.error("[SSR] Failed to fetch article by slug:", e.message);
        return null;
    }
}

/**
 * 核心数据处理管道
 * 
 * 负责将后端原始的 DB Row 转换为前端可用的 ArticleData 视图模型。
 * 包含以下规范化步骤：
 * 1. 解析 content_json 为结构化对象。
 * 2. 提取并去重 Sources URL。
 * 3. 提取单词定义并转换为侧边栏格式。
 * 4. 格式化日期和阅读时间。
 */
function processArticleData(row: ArticleRow, echoes: Record<string, unknown>): ArticleData {
    let parsed = {} as ArticleParsedContent;
    let sources: string[] = [];
    let wordDefinitions: WordDefinition[] = [];
    let sidebarWords: SidebarWord[] = [];
    let dateLabel = "";

    if (row?.articles?.contentJson) {
        console.log("[Loader] Content JSON found, length:", row.articles.contentJson.length);
        parsed = parseArticleContent(row.articles.contentJson);
        console.log("[Loader] Parsed Content:", JSON.stringify(parsed, null, 2));

        sources = extractSources(parsed);
        wordDefinitions = extractWordDefinitions(parsed);
        sidebarWords = mapToSidebarWords(wordDefinitions);
        dateLabel = formatDateLabel(row.tasks?.taskDate);
    }

    const articles = parsed?.result?.articles || [];
    const sortedArticles = [...articles].sort((a, b) => a.level - b.level);
    const title = row?.articles?.title || "Article";
    const category = row?.articles?.category;
    const readLevels = row?.articles?.readLevels || 0;

    return {
        row,
        parsed,
        sources,
        wordDefinitions,
        sidebarWords,
        dateLabel,
        sortedArticles,
        title,
        category,
        readLevels,
        echoes,
        generationMode: row?.generationMode || 'rss',
    };
}
