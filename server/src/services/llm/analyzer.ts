/**
 * Syntax Analysis Engine (句法分析引擎) - Stage 4
 * 
 * 核心挑战：Context Window vs. Precision (上下文与精度的权衡)
 * 1. "Lost in the Middle": 如果一次性分析整篇文章 (2-3k token)，LLM 往往会忽略中间的句子，只分析开头和结尾。
 * 2. 结构化输出坍塌: 要求的 JSON 越长，LLM 越容易生成无效格式 (Syntax Error)。
 * 
 * 解决方案：Divide-and-Conquer (分治策略)
 * 1. Segmentation (分句): 使用 `Intl.Segmenter` (浏览器原生) 进行高精度的语言学分句，优于简单的 Regex。
 * 2. Grouping (分组): 将句子按段落 (Paragraph) 编组。每组 5-10 句，既保留了局部上下文 (Local Context)，又将 Token 保持在 LLM 的"舒适区" (Sweet Spot)。
 * 3. Mapping (映射): LLM 只需返回局部索引，我们再将其映射回全局文章偏移量 (Global Offsets)。
 */

import { extractJson } from './utils';
import type { LLMProvider } from './types';

// ============ 类型定义 ============

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

/** 阶段 4 输出 */
interface AnalyzerOutput {
    articles: ArticleWithAnalysis[];
    usage: Record<string, TokenUsage>;
}

// ============ 常量定义 ============

const VALID_ROLES: readonly AnalysisRole[] = [
    's', 'v', 'o', 'io', 'cmp',
    'rc', 'pp', 'adv', 'app',
    'pas', 'con', 'inf', 'ger', 'ptc'
];

// ============ 辅助函数 ============

/**
 * 使用 Intl.Segmenter 将文章分割为句子
 * 
 * 后处理：修复 Intl.Segmenter 对中间名缩写的错误切分（如 "Jason W. Ricketts"）。
 * 策略：如果前一段以"单个大写字母 + 点"结尾，且后一段不以常见句首词开头，则合并。
 */

// 常见句首词黑名单：如果下一段以这些词开头，则认为是新句子，不合并。
const SENTENCE_STARTERS = new Set([
    'It', 'The', 'This', 'That', 'He', 'She', 'They', 'We', 'I',
    'But', 'And', 'Or', 'So', 'Then', 'If', 'When', 'As', 'However',
    'Meanwhile', 'Moreover', 'Furthermore', 'Therefore', 'Thus',
    'In', 'On', 'At', 'For', 'With', 'By', 'From', 'To', 'A', 'An'
]);

function splitIntoSentences(content: string): SentenceData[] {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(content));

    // Post-processing: Merge segments split by middle initials
    const mergedSegments: { index: number; segment: string }[] = [];

    for (const seg of segments) {
        const last = mergedSegments[mergedSegments.length - 1];

        // Condition: Previous segment ends with " [A-Z]. " (Middle Initial pattern)
        if (last && /[ ][A-Z]\.\s*$/.test(last.segment)) {
            // Check Exclusion: Does the next segment start with a common sentence starter?
            const nextFirstWord = seg.segment.trim().split(/\s+/)[0] || '';
            const isSentenceStarter = SENTENCE_STARTERS.has(nextFirstWord);

            if (!isSentenceStarter) {
                // Merge: This is likely a continuation of a name (e.g., "W. Ricketts")
                last.segment += seg.segment;
                continue;
            }
        }
        mergedSegments.push({ index: seg.index, segment: seg.segment });
    }

    // Rebuild SentenceData with correct offsets
    // Note: After merging, the 'index' of the first segment in a merged group remains correct.
    // The 'end' needs to be recalculated based on the merged segment length.
    return mergedSegments
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
 * 构建段落批量分析的 System Prompt
 * 
 * Prompt 设计要点：
 * 1. 索引映射：要求 LLM 针对 [Sn] 编号的句子输出，避免原文/译文混淆。
 * 2. 角色限定：明确定义需要的语法角色 (S/V/O 等)。
 * 3. 严格 JSON：强制输出严格的 JSON 结构，便于程序解析。
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
 * Offset Mapping Algorithm (偏移量映射算法)
 * 
 * 问题：
 * LLM 返回的是局部文本 (Local Text Snippet)，例如 "apple"。
 * 我们需要知道这到底是文章中第几个 "apple" 的 Start/End Index。
 * 
 * 逻辑：
 * 1. Scope Restriction (范围限定): 我们只在当前句子 (sentence.start ~ sentence.end) 范围内搜索。
 * 2. Coordinate Transformation (坐标变换): 
 *    GlobalOffset = SentenceStartOffset + LocalMatchIndex
 * 
 * 这确保了即使文章中有多个 "apple"，语法标记也能准确对应到 LLM 正在分析的那一个句子的那一个词。
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
 * 分析单个 Article Level 的核心流程
 * 
 * 流程细节：
 * 1. 预处理：分句 -> 按段落分组。
 * 2. 过滤：跳过过短的段落 (如标题或极短描述)，节省 Token。
 * 3. 迭代调用：对每个有效段落构建 Prompt 并调用 LLM。
 * 4. 结果聚合：解析 LLM 响应，转换为全局 Offset，并收集 Token 用量。
 * 5. 错误隔离：单个段落分析失败会记录日志并抛错，由上层决定是否重试（目前策略是抛出异常中断）。
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

// ============ 核心导出 ============

/**
 * 运行全量语法分析（支持增量 Checkpoint 恢复）
 * 
 * 设计思路：
 * 接收 3 个难度等级的文章，顺序进行分析。
 * 每完成一个 Level，都会触发 onLevelComplete 回调。
 * 这允许 TaskExecutor 在数据库中保存已完成的 Levels。
 * 
 * 如果任务在分析 Level 2 时崩溃，下次重启时：
 * 1. completedLevels 参数将包含 Level 1 的结果。
 * 2. 本函数会识别并跳过 Level 1，直接从 Level 2 开始。
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
