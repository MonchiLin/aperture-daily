/**
 * Unified Annotation Renderer
 * 
 * 合并 sentences 和 structure 数据，生成统一的 AST。
 * 用于 SSR 阶段一次性输出所有标注属性。
 * 
 * 输出格式：
 * <span class="s-token" data-sid="0">
 *   <span data-structure="s">Turkey</span>
 *   <span class="target-word" data-word="considering">is <span class="target-word" data-word="considering">considering</span></span>
 * </span>
 */

// ============ Types ============

export type StructureRole =
    | 's' | 'v' | 'o' | 'io' | 'cmp'
    | 'rc' | 'pp' | 'adv' | 'app'
    | 'pas' | 'con' | 'inf' | 'ger' | 'ptc';

export interface SentenceData {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface StructureData {
    start: number;
    end: number;
    role: StructureRole;
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
    | { type: 'structure'; role: StructureRole; children: RenderNode[] }
    | { type: 'word'; lemma: string; children: RenderNode[] };


// ============ Core Logic ============

/**
 * 构建统一 AST（按段落分组）
 * 
 * 直接识别段落边界，返回段落数组
 * 段落分隔符：连续两个换行符 (\n\n) 或句子间有换行
 */
export function buildUnifiedAST(
    content: string,
    sentences: SentenceData[],
    structures: StructureData[],
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

        // 获取该句子内的结构标注
        const sentenceStructures = structures.filter(
            s => s.start >= sentence.start && s.end <= sentence.end
        );

        // 构建句子内部的 AST
        const sentenceContent = content.substring(sentence.start, sentence.end);
        const innerNodes = buildStructureNodes(
            sentenceContent,
            sentenceStructures,
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
 * 构建句子内部的结构标注节点
 * 
 * 策略：过滤掉重叠的结构，只保留不重叠的最外层标注。
 * 这样避免了文本重复问题。
 */
function buildStructureNodes(
    sentenceText: string,
    structures: StructureData[],
    globalOffset: number,
    wordConfigs: WordMatchConfig[] = []
): RenderNode[] {
    const nodes: RenderNode[] = [];

    // 按 start 排序，相同 start 时长的优先
    const sorted = [...structures].sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return (b.end - b.start) - (a.end - a.start); // 长的优先
    });

    // 过滤掉被包含的结构，只保留不重叠的
    const nonOverlapping: StructureData[] = [];
    let lastEnd = -1;

    for (const struct of sorted) {
        // 跳过被前一个范围覆盖的
        if (struct.start < lastEnd) {
            continue;
        }
        nonOverlapping.push(struct);
        lastEnd = struct.end;
    }

    let cursor = 0;

    for (const struct of nonOverlapping) {
        const localStart = struct.start - globalOffset;
        const localEnd = struct.end - globalOffset;

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
        const structText = sentenceText.substring(localStart, localEnd);
        nodes.push({
            type: 'structure',
            role: struct.role,
            children: markTargetWords(structText, wordConfigs)
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
