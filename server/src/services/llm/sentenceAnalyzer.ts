/**
 * Sentence Analyzer - Stage 4 (Paragraph Batch Processing)
 * 
 * 按段落批量分析语法结构，优化 LLM 调用次数。
 * 
 * 核心特性：
 * 1. 预处理：使用 Intl.Segmenter 分句
 * 2. 按段落批量调用 LLM：同一段落的句子一起分析，保持上下文
 * 3. Checkpoint：每完成一个 Article Level 保存进度
 * 4. 恢复：支持从中断的 Level 继续
 */

import { type GeminiClient, type GeminiRequest, extractGeminiText, safeGeminiCall, stripMarkdownCodeBlock } from './geminiClient';
import type { GeminiResponse } from './geminiClient';

// ============ Types ============

export type AnalysisRole =
    | 's' | 'v' | 'o' | 'io' | 'cmp'  // Core
    | 'rc' | 'pp' | 'adv' | 'app'     // Clauses & Phrases
    | 'pas' | 'con'                   // Voice & Connectives
    | 'inf' | 'ger' | 'ptc';          // Non-finite

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
    difficulty_desc: string;
    title?: string;
}

/** 单个 Article 输出格式 (包含分析结果) */
export interface ArticleWithAnalysis extends ArticleInput {
    sentences: SentenceData[];
    structure: AnalysisAnnotation[]; // Staying with 'structure' for DB compatibility
}

/** Stage 4 输入 */
interface AnalyzerInput {
    client: GeminiClient;
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
    usage: Record<string, GeminiResponse['usageMetadata']>;
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
 * 
 * 检测逻辑：如果两个句子之间存在换行符，则认为是段落边界
 */
function groupSentencesByParagraph(content: string, sentences: SentenceData[]): ParagraphGroup[] {
    const groups: ParagraphGroup[] = [];
    let currentSentences: SentenceData[] = [];
    let groupIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]!;
        const prevEnd = i > 0 ? sentences[i - 1]!.end : 0;
        const gap = content.substring(prevEnd, sentence.start);

        // 检测段落边界：句子间是否有换行符
        const hasParagraphBreak = i > 0 && gap.includes('\n');

        if (hasParagraphBreak && currentSentences.length > 0) {
            groups.push({ index: groupIndex++, sentences: [...currentSentences] });
            currentSentences = [];
        }

        currentSentences.push(sentence);
    }

    // 处理最后一组
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

    // 初始化所有句子为空数组
    for (let i = 0; i < sentenceCount; i++) {
        result.set(i, []);
    }

    try {
        const jsonStr = stripMarkdownCodeBlock(text);
        const parsed = JSON.parse(jsonStr);

        if (typeof parsed !== 'object' || parsed === null) {
            console.warn('[ParagraphAnalyzer] Response is not an object');
            return result;
        }

        for (const [key, value] of Object.entries(parsed)) {
            // 支持 "S0" 或 "0" 格式
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
            console.warn(`[SentenceAnalyzer] Invalid role: ${ann.role}`);
            continue;
        }

        // 在原始内容的句子范围内查找
        const sentenceContent = originalContent.substring(sentence.start, sentence.end);
        const localIndex = sentenceContent.indexOf(ann.text);

        if (localIndex === -1) {
            console.warn(`[SentenceAnalyzer] Text not found: "${ann.text}"`);
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
async function analyzeArticle(
    client: GeminiClient,
    model: string,
    article: ArticleInput
): Promise<{ result: ArticleWithAnalysis; usage: GeminiResponse['usageMetadata'] }> {

    if (!article.content) {
        return {
            result: { ...article, sentences: [], structure: [] },
            usage: undefined
        };
    }

    console.log(`[SentenceAnalyzer] Processing Level ${article.level}...`);

    // 1. 分句
    const sentences = splitIntoSentences(article.content);
    console.log(`[SentenceAnalyzer] Level ${article.level}: ${sentences.length} sentences`);

    // 2. 按段落分组
    const paragraphs = groupSentencesByParagraph(article.content, sentences);
    console.log(`[SentenceAnalyzer] Level ${article.level}: ${paragraphs.length} paragraphs`);

    // 3. 逐段落分析
    const allAnalyses: AnalysisAnnotation[] = [];
    let totalUsage: GeminiResponse['usageMetadata'] = undefined;

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const para = paragraphs[pIdx]!;

        // 跳过所有句子都太短的段落
        const totalWords = para.sentences.reduce(
            (sum, s) => sum + s.text.split(/\s+/).length, 0
        );
        if (totalWords < 5) {
            console.log(`[SentenceAnalyzer] Skipping paragraph ${pIdx} (too short: ${totalWords} words)`);
            continue;
        }

        const prompt = buildParagraphPrompt(para.sentences);
        const request: GeminiRequest = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        };

        try {
            const response = await safeGeminiCall(
                `Stage4_L${article.level}_P${pIdx}`,
                () => client.generateContent(model, request)
            );

            // 累积 usage
            if (response.usageMetadata) {
                if (!totalUsage) {
                    totalUsage = { ...response.usageMetadata };
                } else {
                    totalUsage.promptTokenCount = (totalUsage.promptTokenCount || 0) +
                        (response.usageMetadata.promptTokenCount || 0);
                    totalUsage.candidatesTokenCount = (totalUsage.candidatesTokenCount || 0) +
                        (response.usageMetadata.candidatesTokenCount || 0);
                }
            }

            // 解析响应
            const responseText = extractGeminiText(response);
            const paragraphAnalyses = parseParagraphResponse(responseText, para.sentences.length);

            // 转换每个句子的偏移量
            for (let sIdx = 0; sIdx < para.sentences.length; sIdx++) {
                const sentence = para.sentences[sIdx]!;
                const annotations = paragraphAnalyses.get(sIdx) || [];
                const converted = convertToGlobalOffsets(annotations, sentence, article.content);
                allAnalyses.push(...converted);
            }

        } catch (e) {
            console.error(`[SentenceAnalyzer] Failed on paragraph ${pIdx}:`, e);
            // 失败时抛出错误，让上层处理（checkpoint 恢复）
            throw e;
        }
    }

    console.log(`[SentenceAnalyzer] Level ${article.level}: ${allAnalyses.length} annotations`);

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
    const usageAccumulator: Record<string, GeminiResponse['usageMetadata']> = {};

    // 从 checkpoint 恢复已完成的 levels
    const completedArticles: ArticleWithAnalysis[] = args.completedLevels ? [...args.completedLevels] : [];
    const completedLevelNums = new Set(completedArticles.map(a => a.level));

    // 过滤出需要处理的 articles
    const pendingArticles = args.articles.filter(a => !completedLevelNums.has(a.level));

    if (completedArticles.length > 0) {
        console.log(`[SentenceAnalyzer] Resuming from checkpoint. Completed: ${completedArticles.map(a => a.level).join(', ')}`);
    }

    // 逐个 Level 处理
    for (const article of pendingArticles) {
        const { result, usage } = await analyzeArticle(args.client, args.model, article);

        completedArticles.push(result);
        usageAccumulator[`level_${article.level}`] = usage;

        // 每完成一个 Level 保存 checkpoint
        if (args.onLevelComplete) {
            console.log(`[SentenceAnalyzer] Checkpoint: Level ${article.level} complete`);
            await args.onLevelComplete(completedArticles);
        }
    }

    // 按 level 排序
    completedArticles.sort((a, b) => a.level - b.level);

    return { articles: completedArticles, usage: usageAccumulator };
}
