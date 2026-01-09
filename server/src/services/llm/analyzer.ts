/**
 * Sentence Analyzer - Stage 4 (Paragraph Batch Processing)
 */

import { extractJson } from './utils';
import type { LLMProvider } from './types';

// ============ Types ============

export type AnalysisRole =
    | 's' | 'v' | 'o' | 'io' | 'cmp'  // Core
    | 'rc' | 'pp' | 'adv' | 'app'     // Clauses & Phrases
    | 'pas' | 'con'                   // Voice & Connectives
    | 'inf' | 'ger' | 'ptc';          // Non-finite

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

/** 句子数据 */
export interface SentenceData {
    id: number;
    start: number;
    end: number;
    text: string;
}

/** 语法结构标注 */
export interface AnalysisAnnotation {
    start: number;
    end: number;
    role: AnalysisRole;
    text: string;
}

/** LLM 返回的单个标注 */
interface LLMAnnotation {
    text: string;
    role: string;
}

/** 段落分组 */
interface ParagraphGroup {
    index: number;
    sentences: SentenceData[];
}

/** 单个 Article 输入格式 */
export interface ArticleInput {
    level: 1 | 2 | 3;
    content: string;
    level_name: string;
    title?: string;
}

/** 单个 Article 输出格式 (包含分析结果) */
export interface ArticleWithAnalysis extends ArticleInput {
    sentences: SentenceData[];
    structure: AnalysisAnnotation[];
}

/** Stage 4 输入 */
interface AnalyzerInput {
    client: LLMProvider;
    model: string;
    articles: ArticleInput[];
    /** 已完成的 levels (用于恢复) */
    completedLevels?: ArticleWithAnalysis[];
    /** 每完成一个 Level 的回调 (用于 checkpoint) */
    onLevelComplete?: (completedArticles: ArticleWithAnalysis[]) => Promise<void>;
}

/** Stage 4 输出 */
interface AnalyzerOutput {
    articles: ArticleWithAnalysis[];
    usage: Record<string, TokenUsage>;
}

// ============ Constants ============

const VALID_ROLES: readonly AnalysisRole[] = [
    's', 'v', 'o', 'io', 'cmp',
    'rc', 'pp', 'adv', 'app',
    'pas', 'con', 'inf', 'ger', 'ptc'
];

// ============ Helper Functions ============

/**
 * 使用 Intl.Segmenter 将文章分割为句子
 */
function splitIntoSentences(content: string): SentenceData[] {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(content));

    return segments
        .map((seg, idx) => ({
            id: idx,
            start: seg.index,
            end: seg.index + seg.segment.length,
            text: seg.segment.trim()
        }))
        .filter(s => s.text.length > 0);
}

/**
 * 按段落分组句子
 */
function groupSentencesByParagraph(content: string, sentences: SentenceData[]): ParagraphGroup[] {
    const groups: ParagraphGroup[] = [];
    let currentSentences: SentenceData[] = [];
    let groupIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]!;
        const prevEnd = i > 0 ? sentences[i - 1]!.end : 0;
        const gap = content.substring(prevEnd, sentence.start);

        const hasParagraphBreak = i > 0 && gap.includes('\n');

        if (hasParagraphBreak && currentSentences.length > 0) {
            groups.push({ index: groupIndex++, sentences: [...currentSentences] });
            currentSentences = [];
        }

        currentSentences.push(sentence);
    }

    if (currentSentences.length > 0) {
        groups.push({ index: groupIndex, sentences: currentSentences });
    }

    return groups;
}

/**
 * 构建段落批量分析的 Prompt
 */
function buildParagraphPrompt(sentences: SentenceData[]): string {
    const numberedSentences = sentences
        .map((s, idx) => `[S${idx}] ${s.text}`)
        .join('\n\n');

    return `<task>
分析以下段落中每个句子的语法成分。

<paragraph>
${numberedSentences}
</paragraph>

<roles>
s=主语, v=谓语(含助动词), o=直接宾语, io=间接宾语, cmp=补语,
rc=定语从句, pp=介词短语, adv=状语, app=同位语,
pas=被动语态, con=连接词, inf=不定式, ger=动名词, ptc=分词
</roles>

<rules>
1. text 必须是句子中的原文片段
2. 谓语 v 包含完整动词短语
3. 被动语态同时标注 v 和 pas
</rules>

<output>
\`\`\`json
{
  "S0": [{"text": "片段", "role": "角色"}, ...],
  "S1": [...],
  ...
}
\`\`\`
</output>
</task>`;
}

/**
 * 解析段落分析响应
 */
function parseParagraphResponse(text: string, sentenceCount: number): Map<number, LLMAnnotation[]> {
    const result = new Map<number, LLMAnnotation[]>();

    for (let i = 0; i < sentenceCount; i++) {
        result.set(i, []);
    }

    try {
        const jsonStr = extractJson(text);
        const parsed = JSON.parse(jsonStr);

        if (typeof parsed !== 'object' || parsed === null) {
            console.warn('[ParagraphAnalyzer] Response is not an object');
            return result;
        }

        for (const [key, value] of Object.entries(parsed)) {
            const idxMatch = key.match(/^S?(\d+)$/);
            if (!idxMatch) continue;

            const idx = parseInt(idxMatch[1]!);
            if (idx >= sentenceCount) continue;

            if (Array.isArray(value)) {
                const validAnnotations = (value as any[]).filter(item =>
                    typeof item.text === 'string' &&
                    typeof item.role === 'string' &&
                    item.text.length > 0
                );
                result.set(idx, validAnnotations);
            }
        }
    } catch (e) {
        console.error('[ParagraphAnalyzer] Failed to parse response:', e);
    }

    return result;
}

/**
 * 将 LLM 标注转换为全局偏移量
 */
function convertToGlobalOffsets(
    annotations: LLMAnnotation[],
    sentence: SentenceData,
    originalContent: string
): AnalysisAnnotation[] {
    const results: AnalysisAnnotation[] = [];

    for (const ann of annotations) {
        const role = ann.role.toLowerCase() as AnalysisRole;
        if (!VALID_ROLES.includes(role)) {
            continue;
        }

        const sentenceContent = originalContent.substring(sentence.start, sentence.end);
        const localIndex = sentenceContent.indexOf(ann.text);

        if (localIndex === -1) {
            continue;
        }

        results.push({
            start: sentence.start + localIndex,
            end: sentence.start + localIndex + ann.text.length,
            role,
            text: ann.text
        });
    }

    return results;
}

/**
 * 分析单个 Article Level (按段落批处理)
 */
async function analyzeArticle(args: {
    client: LLMProvider;
    // model: string; // Removed unused model
    article: ArticleInput;
}): Promise<{ result: ArticleWithAnalysis; usage: TokenUsage | undefined }> {
    const { article, client } = args;

    if (!article.content) {
        return {
            result: { ...article, sentences: [], structure: [] },
            usage: undefined
        };
    }

    console.log(`[SentenceAnalyzer] Processing Level ${article.level}...`);

    // 1. 分句
    const sentences = splitIntoSentences(article.content);
    // 2. 按段落分组
    const paragraphs = groupSentencesByParagraph(article.content, sentences);

    const allAnalyses: AnalysisAnnotation[] = [];
    let totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const para = paragraphs[pIdx]!;

        const totalWords = para.sentences.reduce(
            (sum, s) => sum + s.text.split(/\s+/).length, 0
        );
        if (totalWords < 5) {
            continue;
        }

        const prompt = buildParagraphPrompt(para.sentences);

        try {
            const response = await client.generate({
                prompt: prompt,
                system: 'You are a grammar analyzer specialized in English linguistic structure. Your task is to identify key structural roles like Subject, Verb, Object, and various clauses/phrases in the given text. Output strictly valid JSON.',
                // config logic handled by provider
            });

            const responseText = response.text;
            const usage = response.usage;

            if (usage) {
                totalUsage.inputTokens += usage.inputTokens;
                totalUsage.outputTokens += usage.outputTokens;
                totalUsage.totalTokens += usage.totalTokens;
            }

            const paragraphAnalyses = parseParagraphResponse(responseText, para.sentences.length);

            for (let sIdx = 0; sIdx < para.sentences.length; sIdx++) {
                const sentence = para.sentences[sIdx]!;
                const annotations = paragraphAnalyses.get(sIdx) || [];
                const converted = convertToGlobalOffsets(annotations, sentence, article.content);
                allAnalyses.push(...converted);
            }

        } catch (e) {
            console.error(`[SentenceAnalyzer] Failed on paragraph ${pIdx}:`, e);
            throw e;
        }
    }

    return {
        result: {
            ...article,
            sentences,
            structure: allAnalyses.sort((a, b) => a.start - b.start)
        },
        usage: totalUsage
    };
}

// ============ Main Export ============

/**
 * 运行语法分析（支持 Checkpoint 恢复）
 */
export async function runSentenceAnalysis(args: AnalyzerInput): Promise<AnalyzerOutput> {
    const usageAccumulator: Record<string, TokenUsage> = {};
    const { client, articles, completedLevels = [], onLevelComplete } = args; // Removed unused model

    const completedArticles: ArticleWithAnalysis[] = [...completedLevels];
    const completedLevelNums = new Set(completedArticles.map(a => a.level));

    const pendingArticles = articles.filter(a => !completedLevelNums.has(a.level));

    if (completedArticles.length > 0) {
        console.log(`[SentenceAnalyzer] Resuming from checkpoint. Completed: ${completedArticles.map(a => a.level).join(', ')}`);
    }

    for (const article of pendingArticles) {
        const { result, usage } = await analyzeArticle({ client, article });

        completedArticles.push(result);
        if (usage) {
            usageAccumulator[`level_${article.level}`] = usage;
        }

        if (onLevelComplete) {
            console.log(`[SentenceAnalyzer] Checkpoint: Level ${article.level} complete`);
            await onLevelComplete(completedArticles);
        }
    }

    completedArticles.sort((a, b) => a.level - b.level);

    return { articles: completedArticles, usage: usageAccumulator };
}
