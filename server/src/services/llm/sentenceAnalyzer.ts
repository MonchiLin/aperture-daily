/**
 * Sentence Analyzer - Stage 4 Refactored (with Checkpoint Support)
 * 
 * 逐句分析语法结构，简化 LLM 输入输出。
 * 
 * 核心特性：
 * 1. 预处理：使用 Intl.Segmenter 分句
 * 2. 逐句 LLM 调用：每句独立分析
 * 3. Checkpoint：每完成一个 Article Level 保存进度
 * 4. 恢复：支持从中断的 Level 继续
 */

import { type GeminiClient, type GeminiRequest, extractGeminiText, safeGeminiCall } from './geminiClient';
import type { GeminiResponse } from './geminiClient';

// ============ Types ============

export type StructureRole =
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
export interface StructureAnnotation {
    start: number;
    end: number;
    role: StructureRole;
    text: string;
}

/** LLM 返回的单个标注 */
interface LLMAnnotation {
    text: string;
    role: string;
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
    structure: StructureAnnotation[];
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

const VALID_ROLES: readonly StructureRole[] = [
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
 * 构建逐句分析的 Prompt
 */
function buildSentencePrompt(sentence: string): string {
    return `<task>
分析以下英语句子的语法成分，返回 JSON 数组。

<sentence>
${sentence}
</sentence>

<roles>
s = 主语 (Subject)
v = 谓语 (Verb，包含助动词)
o = 直接宾语 (Direct Object)
io = 间接宾语 (Indirect Object)
cmp = 补语 (Complement)
rc = 定语从句 (Relative Clause)
pp = 介词短语 (Prepositional Phrase)
adv = 状语 (Adverbial)
app = 同位语 (Appositive)
pas = 被动语态 (Passive Voice)
con = 连接词 (Connective)
inf = 不定式 (Infinitive)
ger = 动名词 (Gerund)
ptc = 分词 (Participle)
</roles>

<rules>
1. 每个标注的 text 必须是句子中的原文片段
2. 谓语 v 包含完整动词短语（助动词 + 主动词）
3. 被动语态同时标注 v 和 pas
4. 只返回 JSON 数组，不要其他内容
</rules>

<output_format>
[{"text": "原文片段", "role": "角色代码"}, ...]
</output_format>

示例输出:
\`\`\`json
[{"text":"The scientists","role":"s"},{"text":"have discovered","role":"v"},{"text":"new evidence","role":"o"}]
\`\`\`
</task>`;
}

/**
 * 解析 LLM 返回的 JSON
 */
function parseLLMResponse(text: string): LLMAnnotation[] {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1]!.trim() : text.trim();

    try {
        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) {
            console.warn('[SentenceAnalyzer] LLM response is not an array');
            return [];
        }

        return parsed.filter(item =>
            typeof item.text === 'string' &&
            typeof item.role === 'string' &&
            item.text.length > 0
        );
    } catch (e) {
        console.error('[SentenceAnalyzer] Failed to parse LLM response:', e);
        return [];
    }
}

/**
 * 将 LLM 标注转换为全局偏移量
 */
function convertToGlobalOffsets(
    annotations: LLMAnnotation[],
    sentence: SentenceData,
    originalContent: string
): StructureAnnotation[] {
    const results: StructureAnnotation[] = [];

    for (const ann of annotations) {
        const role = ann.role.toLowerCase() as StructureRole;
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
 * 分析单个 Article Level
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

    // 2. 逐句分析
    const allStructures: StructureAnnotation[] = [];
    let totalUsage: GeminiResponse['usageMetadata'] = undefined;

    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]!;

        // 跳过太短的句子
        if (sentence.text.split(/\s+/).length < 3) {
            continue;
        }

        const prompt = buildSentencePrompt(sentence.text);
        const request: GeminiRequest = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        };

        try {
            const response = await safeGeminiCall(
                `Stage4_L${article.level}_S${i}`,
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

            const responseText = extractGeminiText(response);
            const annotations = parseLLMResponse(responseText);
            const structures = convertToGlobalOffsets(annotations, sentence, article.content);
            allStructures.push(...structures);

        } catch (e) {
            console.error(`[SentenceAnalyzer] Failed on sentence ${i}:`, e);
            // 继续处理下一句
        }
    }

    console.log(`[SentenceAnalyzer] Level ${article.level}: ${allStructures.length} annotations`);

    return {
        result: {
            ...article,
            sentences,
            structure: allStructures.sort((a, b) => a.start - b.start)
        },
        usage: totalUsage
    };
}

// ============ Main Export ============

/**
 * 运行逐句语法分析（支持 Checkpoint 恢复）
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
