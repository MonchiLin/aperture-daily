/**
 * Annotation Engine
 * 
 * 合并 sentences 和 analysis 数据，生成统一的 Analysis Tree。
 * 用于 SSR 阶段一次性输出所有标注属性。
 * 
 * 输出格式：
 * <span class="s-token" data-sid="0">
 *   <span data-analysis="s">Turkey</span>
 *   <span class="target-word" data-word="considering">is <span class="target-word" data-word="considering">considering</span></span>
 * </span>
 */

import type { AnalysisRole } from './GrammarRules';

// ============ Types ============

export interface SentenceData {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface AnalysisData {
    start: number;
    end: number;
    role: AnalysisRole;
    text?: string;
}

/** 单词匹配配置 */
export interface WordMatchConfig {
    lemma: string;       // 词根 (e.g., "run")
    forms: string[];     // 所有变形 (e.g., ["run", "runs", "ran", "running"])
}

/** 渲染节点类型 */
export type RenderNode =
    | { type: 'text'; content: string }
    | { type: 'sentence'; sid: number; children: RenderNode[] }
    | { type: 'analysis'; role: AnalysisRole; children: RenderNode[] }
    | { type: 'word'; lemma: string; children: RenderNode[] };


// ============ Core Logic ============

/**
 * 构建分析树 (Sentence Analysis Tree)
 * 
 * 核心职责:
 * 1. 结构化: 将平铺的文本转换为段落 -> 句子 -> 分析节点/单词/文本 的树状结构。
 * 2. 混合: 将 "Sentence Split" (分句) 和 "Grammar Analysis" (语法分析) 数据合并。
 * 3. 容错: 处理换行符作为段落分隔。
 * 
 * @param content - 文章全文
 * @param sentences - 分句数据 (由 Intl.Segmenter 或 LLM 生成)
 * @param analyses - 语法分析标注 (LLM 生成, 可能包含重叠结构)
 * @param wordConfigs - 单词高亮配置 (Side Quest 词汇)
 */
export function buildAnalysisTree(
    content: string,
    sentences: SentenceData[],
    analyses: AnalysisData[],
    wordConfigs: WordMatchConfig[] = []
): RenderNode[][] {
    const paragraphs: RenderNode[][] = [];
    let currentParagraph: RenderNode[] = [];
    let cursor = 0;

    // 检测是否为段落分隔
    const isParagraphBreak = (text: string) => text.includes('\n');

    for (const sentence of sentences) {
        // 检查句子前的间隙是否包含段落分隔
        if (sentence.start > cursor) {
            const gap = content.substring(cursor, sentence.start);

            if (isParagraphBreak(gap)) {
                // 遇到段落分隔，保存当前段落，开始新段落
                if (currentParagraph.length > 0) {
                    paragraphs.push(currentParagraph);
                    currentParagraph = [];
                }
            } else if (gap.trim()) {
                // 非段落分隔的有意义文本
                currentParagraph.push({ type: 'text', content: gap });
            }
        }

        // 获取该句子内的分析标注
        const sentenceAnalyses = analyses.filter(
            s => s.start >= sentence.start && s.end <= sentence.end
        );

        // 构建句子内部的 AST
        const sentenceContent = content.substring(sentence.start, sentence.end);
        const innerNodes = buildAnalysisNodes(
            sentenceContent,
            sentenceAnalyses,
            sentence.start,
            wordConfigs
        );

        currentParagraph.push({
            type: 'sentence',
            sid: sentence.id,
            children: innerNodes
        });

        cursor = sentence.end;
    }

    // 处理最后一段
    if (cursor < content.length) {
        const remaining = content.substring(cursor);
        if (remaining.trim()) {
            currentParagraph.push({ type: 'text', content: remaining });
        }
    }

    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
    }

    return paragraphs;
}

/**
 * 构建句子内部的分析标注节点
 * 
 * 策略 (FLATTENING STRATEGY):
 * LLM 可能会返回嵌套的结构 (例如: 定语从句可以包含主语)。
 * 但为了简化渲染和避免 DOM 嵌套混乱，我们采用 "Flat Visualization" (扁平化可视化) 策略:
 * 
 * 1. 过滤掉所有重叠的结构 (Overlapping Structures)。
 * 2. 优先保留 *最长* 的结构 (通常是外层结构)。
 *    例如: 如果 [A [B] C], 我们只渲染 A，忽略嵌套在内的 B。
 *    注意: GrammarRules 中的 'priority' 属性在这里尚未生效，
 *    目前的逻辑是纯粹基于长度和位置的几何过滤。
 */
function buildAnalysisNodes(
    sentenceText: string,
    analyses: AnalysisData[],
    globalOffset: number,
    wordConfigs: WordMatchConfig[] = []
): RenderNode[] {
    const nodes: RenderNode[] = [];

    // 按 start 排序，相同 start 时长的优先 (Greedy: Longest First)
    const sorted = [...analyses].sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return (b.end - b.start) - (a.end - a.start); // 长的优先
    });

    // 过滤掉被包含的结构，只保留不重叠的
    const nonOverlapping: AnalysisData[] = [];
    let lastEnd = -1;

    for (const item of sorted) {
        // 跳过被前一个范围覆盖的 (即跳过嵌套的子结构)
        if (item.start < lastEnd) {
            continue;
        }
        nonOverlapping.push(item);
        lastEnd = item.end;
    }

    let cursor = 0;

    for (const item of nonOverlapping) {
        const localStart = item.start - globalOffset;
        const localEnd = item.end - globalOffset;

        // 跳过超出范围的
        if (localStart < 0 || localEnd > sentenceText.length) {
            continue;
        }

        // 添加结构前的纯文本 (带单词高亮)
        if (localStart > cursor) {
            const textContent = sentenceText.substring(cursor, localStart);
            nodes.push(...markTargetWords(textContent, wordConfigs));
        }

        // 添加结构节点 (结构内部也带单词高亮)
        const itemText = sentenceText.substring(localStart, localEnd);
        nodes.push({
            type: 'analysis',
            role: item.role,
            children: markTargetWords(itemText, wordConfigs)
        });

        cursor = localEnd;
    }

    // 添加剩余文本 (带单词高亮)
    if (cursor < sentenceText.length) {
        const remaining = sentenceText.substring(cursor);
        nodes.push(...markTargetWords(remaining, wordConfigs));
    }

    return nodes;
}

/**
 * 在文本中标记目标单词
 * 
 * 将纯文本转换为文本节点和单词节点的混合数组
 */
function markTargetWords(text: string, wordConfigs: WordMatchConfig[]): RenderNode[] {
    // 如果没有配置，直接返回文本节点
    if (wordConfigs.length === 0 || !text.trim()) {
        return [{ type: 'text', content: text }];
    }

    const results: RenderNode[] = [];
    // 匹配单词的正则 (字母、数字、连字符、撇号)
    const wordRegex = /([a-zA-Z0-9'-]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
        const word = match[0];
        const wordStart = match.index;
        const lowercaseWord = word.toLowerCase();

        // 添加单词前的文本
        if (wordStart > lastIndex) {
            results.push({ type: 'text', content: text.substring(lastIndex, wordStart) });
        }

        // 检查是否为目标单词
        const config = wordConfigs.find(c => c.forms.includes(lowercaseWord));

        if (config) {
            // 目标单词，包裹为 word 节点
            results.push({
                type: 'word',
                lemma: config.lemma,
                children: [{ type: 'text', content: word }]
            });
        } else {
            // 非目标单词，保持为文本
            results.push({ type: 'text', content: word });
        }

        lastIndex = wordStart + word.length;
    }

    // 添加剩余文本
    if (lastIndex < text.length) {
        results.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return results;
}
