/**
 * Unified Annotation Renderer
 * 
 * 合并 sentences 和 structure 数据，生成统一的 AST。
 * 用于 SSR 阶段一次性输出所有标注属性。
 * 
 * 输出格式：
 * <span class="s-token" data-sid="0">
 *   <span data-structure="s">Turkey</span>
 *   <span data-structure="v">is considering</span>
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

/** 渲染节点类型 */
export type RenderNode =
    | { type: 'text'; content: string }
    | { type: 'sentence'; sid: number; children: RenderNode[] }
    | { type: 'structure'; role: StructureRole; children: RenderNode[] };

// ============ Core Logic ============

/**
 * 构建统一 AST
 * 
 * 层级结构：
 * - 最外层按句子边界分割
 * - 内层嵌套语法结构标注
 */
export function buildUnifiedAST(
    content: string,
    sentences: SentenceData[],
    structures: StructureData[]
): RenderNode[] {
    const result: RenderNode[] = [];
    let cursor = 0;

    // 按句子边界处理
    for (const sentence of sentences) {
        // 添加句子前的文本（如果有）
        if (sentence.start > cursor) {
            const gap = content.substring(cursor, sentence.start);
            if (gap.trim()) {
                result.push({ type: 'text', content: gap });
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
            sentence.start
        );

        result.push({
            type: 'sentence',
            sid: sentence.id,
            children: innerNodes
        });

        cursor = sentence.end;
    }

    // 添加最后一个句子后的文本
    if (cursor < content.length) {
        const remaining = content.substring(cursor);
        if (remaining.trim()) {
            result.push({ type: 'text', content: remaining });
        }
    }

    return result;
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
    globalOffset: number
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

        // 添加结构前的纯文本
        if (localStart > cursor) {
            nodes.push({
                type: 'text',
                content: sentenceText.substring(cursor, localStart)
            });
        }

        // 添加结构节点
        const structText = sentenceText.substring(localStart, localEnd);
        nodes.push({
            type: 'structure',
            role: struct.role,
            children: [{ type: 'text', content: structText }]
        });

        cursor = localEnd;
    }

    // 添加剩余文本
    if (cursor < sentenceText.length) {
        nodes.push({
            type: 'text',
            content: sentenceText.substring(cursor)
        });
    }

    return nodes;
}

/**
 * 将 AST 按段落分割
 * 基于换行符将节点分组
 */
export function splitASTIntoParagraphs(nodes: RenderNode[]): RenderNode[][] {
    const paragraphs: RenderNode[][] = [];
    let current: RenderNode[] = [];

    for (const node of nodes) {
        if (node.type === 'text' && node.content.includes('\n')) {
            // 分割包含换行的文本节点
            const parts = node.content.split('\n');
            for (let i = 0; i < parts.length; i++) {
                if (parts[i]!.trim()) {
                    current.push({ type: 'text', content: parts[i]! });
                }
                if (i < parts.length - 1 && current.length > 0) {
                    paragraphs.push(current);
                    current = [];
                }
            }
        } else {
            current.push(node);
        }
    }

    if (current.length > 0) {
        paragraphs.push(current);
    }

    return paragraphs;
}
