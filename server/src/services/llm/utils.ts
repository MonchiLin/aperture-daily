/**
 * LLM 工具函数模块
 *
 * 提供 LLM 服务层的通用工具函数，主要用于：
 * 1. LLM 输出的后处理（JSON 提取、格式归一化）
 * 2. URL 解析与重定向处理
 * 3. 候选词处理
 *
 * 设计原则：
 * - 容错优先：LLM 输出格式不可控，工具函数需健壮处理各种边缘情况
 * - 纯函数：无副作用，便于测试
 */

import type { DailyNewsOutput } from '../../schemas/dailyNews';

// ════════════════════════════════════════════════════════════════
// 常量定义
// ════════════════════════════════════════════════════════════════

/** 选词数量下限：至少选择 1 个词 */
export const WORD_SELECTION_MIN_WORDS = 1;

/** 选词数量上限：最多选择 8 个词，避免文章过于拥挤 */
export const WORD_SELECTION_MAX_WORDS = 8;

/** 来源 URL 数量上限：只保留最权威的 1 个来源 */
export const SOURCE_URL_LIMIT = 1;

// ════════════════════════════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════════════════════════════

/**
 * 候选词类型
 *
 * type 字段用于优先级排序：
 * - 'new': 新学词汇，优先使用
 * - 'review': 复习词汇，作为填充
 */
export type CandidateWord = {
    word: string;
    type: 'new' | 'review';
};

// ════════════════════════════════════════════════════════════════
// 文章内容处理
// ════════════════════════════════════════════════════════════════

/**
 * 确保文章内容有正确的段落分隔
 *
 * 问题背景：
 * LLM 有时会生成没有段落分隔的连续文本，影响阅读体验。
 *
 * 处理策略：
 * 1. 如果已有 \n\n 分隔，保持原样（只清理格式）
 * 2. 如果没有分隔，按句子拆分后重新组合为段落
 *    - Level 1: 2 段
 *    - Level 2: 2 段
 *    - Level 3: 3 段
 */
function ensureContentParagraphs(content: string, level: number) {
    const text = content.replace(/\r\n/g, '\n').trim();
    if (!text) return text;

    // 已有段落分隔，只做格式清理
    if (/\n\s*\n/.test(text)) {
        const paragraphs = text
            .split(/\n\s*\n+/)
            .map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim())
            .filter(Boolean);
        return paragraphs.join('\n\n');
    }

    // 无段落分隔，按句子重新拆分
    const flattened = text.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!flattened) return flattened;

    // 在句末标点后插入换行（后面紧跟大写字母或数字）
    const withLines = flattened.replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n');
    const sentences = withLines
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    if (sentences.length <= 1) return flattened;

    // 根据难度级别决定段落数
    const desiredParagraphs = level === 1 ? 2 : level === 2 ? 2 : 3;
    const perParagraph = Math.max(2, Math.ceil(sentences.length / desiredParagraphs));

    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += perParagraph) {
        paragraphs.push(sentences.slice(i, i + perParagraph).join(' '));
    }
    return paragraphs.join('\n\n');
}

/**
 * 归一化 DailyNewsOutput
 *
 * 对所有文章内容应用段落格式化
 */
export function normalizeDailyNewsOutput(output: DailyNewsOutput): DailyNewsOutput {
    return {
        ...output,
        articles: output.articles.map((a) => ({
            ...a,
            content: ensureContentParagraphs(a.content, a.level),
        }))
    };
}

// ════════════════════════════════════════════════════════════════
// URL 处理
// ════════════════════════════════════════════════════════════════

/**
 * 清理 URL 格式
 *
 * 处理 LLM 输出中常见的 URL 格式问题：
 * - 尖括号包裹：<https://example.com>
 * - 尾部标点：https://example.com.
 * - Markdown 链接残留：https://example.com)
 */
function normalizeUrl(raw: string) {
    return raw
        .trim()
        .replace(/^<+/, '')
        .replace(/>+$/, '')
        .replace(/[)\]}<>.,;:，。；：]+$/, '');
}

// ════════════════════════════════════════════════════════════════
// 选词处理
// ════════════════════════════════════════════════════════════════

/**
 * 词汇列表去重和裁剪
 *
 * 确保不超过 WORD_SELECTION_MAX_WORDS 上限
 */
function normalizeWordList(words: string[]) {
    const unique = Array.from(
        new Set(words.map((word) => word.trim()).filter(Boolean))
    );
    return unique.slice(0, WORD_SELECTION_MAX_WORDS);
}

/**
 * 从 LLM 响应中提取词汇列表
 *
 * 容错处理：LLM 可能返回多种格式
 * - 字符串：单个词
 * - 字符串数组：["word1", "word2"]
 * - 对象数组：[{ word: "word1" }, { word: "word2" }]
 */
function pickWordList(raw: unknown): string[] | null {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        return trimmed ? [trimmed] : null;
    }
    if (!Array.isArray(raw)) return null;

    // 尝试直接提取字符串数组
    const direct = raw
        .filter((item) => typeof item === 'string')
        .map((word) => word.trim())
        .filter(Boolean);
    if (direct.length > 0) return normalizeWordList(direct);

    // 尝试从对象数组中提取 word 字段
    const fromObjects = raw
        .map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const word = (item as Record<string, unknown>).word;
            return typeof word === 'string' ? word.trim() : null;
        })
        .filter((word): word is string => Boolean(word));
    if (fromObjects.length > 0) return normalizeWordList(fromObjects);

    return null;
}

/**
 * 提取选词理由（兼容多种字段名）
 *
 * LLM 可能使用不同的字段名：
 * selection_reasoning, selectionReasoning, reasoning, reason, rationale...
 */
function pickSelectionReasoning(obj: Record<string, unknown>) {
    const raw =
        obj.selection_reasoning ??
        obj.selectionReasoning ??
        obj.reasoning ??
        obj.reason ??
        obj.rationale ??
        obj.selection_rationale;
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return trimmed ? trimmed : undefined;
}

/**
 * 归一化选词 JSON 响应
 *
 * 严格模式：只接受 selected_words 字段，不做模糊匹配
 * 这是为了避免歧义和提高可预测性
 */
export function normalizeWordSelectionPayload(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const obj = value as Record<string, unknown>;

    const selectedWords = pickWordList(obj.selected_words);
    if (!selectedWords?.length) return value;

    const normalized: Record<string, unknown> = {
        ...obj,
        selected_words: selectedWords
    };

    if (typeof obj.selection_reasoning !== 'string') {
        const reasoning = pickSelectionReasoning(obj);
        if (reasoning) normalized.selection_reasoning = reasoning;
    }
    return normalized;
}

// ════════════════════════════════════════════════════════════════
// URL 提取
// ════════════════════════════════════════════════════════════════

/** 从文本中提取 HTTP(S) URL */
export function extractHttpUrlsFromText(text: string): string[] {
    const matches = text.match(/https?:\/\/[^\s<>()[\]]+/g) ?? [];
    return matches.map(normalizeUrl).filter(Boolean);
}

/**
 * 递归收集对象中的所有 URL
 *
 * 用于从复杂的 LLM 响应结构中提取所有 URL
 * 防止循环引用导致死循环
 */
export function collectHttpUrlsFromUnknown(value: unknown): string[] {
    const urls: string[] = [];
    const seen = new Set<unknown>();

    const walk = (v: unknown) => {
        if (v == null) return;
        if (typeof v === 'string') {
            urls.push(...extractHttpUrlsFromText(v));
            return;
        }
        if (typeof v !== 'object') return;
        if (seen.has(v)) return;  // 防止循环引用
        seen.add(v);

        if (Array.isArray(v)) {
            for (const item of v) walk(item);
            return;
        }
        for (const item of Object.values(v as Record<string, unknown>)) walk(item);
    };
    walk(value);
    return urls;
}

// ════════════════════════════════════════════════════════════════
// URL 重定向解析
// ════════════════════════════════════════════════════════════════

/**
 * 解析 Gemini Google Search 返回的重定向 URL
 *
 * 问题背景：
 * Gemini 的 Grounding 功能返回的 URL 是 Google 的重定向链接，
 * 格式：vertexaisearch.cloud.google.com/grounding-api-redirect/...
 * 需要解析获取真实的新闻来源地址。
 *
 * 策略：
 * - 使用 HEAD 请求跟踪重定向（避免下载完整内容）
 * - 5 秒超时，超时返回原 URL
 * - 解析失败不阻断主流程
 */
export async function resolveRedirectUrl(url: string): Promise<string> {
    if (!url.includes('vertexaisearch.cloud.google.com/grounding-api-redirect')) {
        return url;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.url && res.url !== url) {
            console.log(`[URL Resolver] Resolved: ${url.slice(0, 80)}... -> ${res.url}`);
            return res.url;
        }

        return url;
    } catch (error) {
        // 解析失败返回原 URL，不影响主流程
        console.warn(`[URL Resolver] Failed to resolve: ${url.slice(0, 80)}...`, error);
        return url;
    }
}

/** 批量解析 URL 重定向，自动去重 */
export async function resolveRedirectUrls(urls: string[]): Promise<string[]> {
    const resolved = await Promise.all(urls.map(resolveRedirectUrl));
    // 去重（多个重定向可能指向同一真实 URL）
    return Array.from(new Set(resolved));
}

// ════════════════════════════════════════════════════════════════
// JSON 提取
// ════════════════════════════════════════════════════════════════

/**
 * 从模糊文本中提取 JSON 部分
 *
 * 处理策略（按优先级）：
 * 1. 提取 ```json 代码块
 * 2. 提取任意 ``` 代码块（首字符为 {）
 * 3. 兜底：从第一个 { 到最后一个 }
 *
 * 为什么需要这个函数？
 * LLM 经常在 JSON 前后添加解释性文字，直接 JSON.parse 会失败
 */
export function extractJson(text: string): string {
    // 优先匹配 ```json 代码块
    const codeBlockMatch = text.match(/```json\n?([\s\S]*?)\n?```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
        return codeBlockMatch[1].trim();
    }

    // 匹配任意代码块
    const genericBlockMatch = text.match(/```\n?([\s\S]*?)\n?```/);
    if (genericBlockMatch && genericBlockMatch[1]) {
        const potential = genericBlockMatch[1].trim();
        if (potential.startsWith('{')) return potential;
    }

    // 兜底：查找 { 和 }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');

    if (start !== -1 && end !== -1 && end > start) {
        return text.substring(start, end + 1).trim();
    }

    // 原样返回，交给 JSON.parse 报错
    return text.trim();
}

// ════════════════════════════════════════════════════════════════
// 多轮对话支持
// ════════════════════════════════════════════════════════════════

/** 通用消息格式（跨 Provider 兼容） */
export interface AgnosticMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/** 简化的 LLM 客户端接口（用于 analyzer.ts） */
export interface ILLMClient {
    generateContent(
        messages: AgnosticMessage[],
        options?: {
            system?: string;
            model?: string;
        }
    ): Promise<{
        text: string;
        usage?: {
            inputTokens: number;
            outputTokens: number;
            totalTokens: number;
        };
    }>;
}

/** 将 LLM 响应追加到对话历史 */
export function appendResponseToHistory(history: AgnosticMessage[], responseText: string): AgnosticMessage[] {
    return [
        ...history,
        { role: 'assistant', content: responseText }
    ];
}

