/**
 * Gemini 三阶段生成函数
 * 
 * 三阶段 CoT 流水线：搜索+选词 → 草稿 → JSON 转换
 * 使用 Gemini REST API 原生格式
 */

import type { DailyNewsOutput } from '../../schemas/dailyNews';
import { dailyNewsOutputSchema } from '../../schemas/dailyNews';
import { SOURCE_URL_LIMIT } from './limits';
import {
    collectHttpUrlsFromUnknown,
    extractHttpUrlsFromText,
    normalizeDailyNewsOutput,
    resolveRedirectUrls
} from './helpers';
import {
    SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
    DRAFT_SYSTEM_INSTRUCTION,
    JSON_SYSTEM_INSTRUCTION,
    buildSearchAndSelectionUserPrompt,
    buildDraftGenerationUserPrompt,
    buildJsonConversionUserPrompt
} from './prompts3stage';
import {
    extractGeminiText,
    safeGeminiCall,
    stripMarkdownCodeBlock,
    type GeminiClient,
    type GeminiMessage,
    type ThinkingLevel
} from './geminiClient';

// Gemini 对话历史类型
export type GeminiHistory = GeminiMessage[];

// Thinking 级别配置
export const geminiThinkingLevel: ThinkingLevel = 'high';

// Stage 1: 搜索 + 选词
export async function runGeminiSearchAndSelection(args: {
    client: GeminiClient;
    history: GeminiHistory;
    model: string;
    candidateWords: string[];
    topicPreference: string;
    currentDate: string;
}) {
    console.log('[Gemini Stage 1/3] Search + Selection - START', {
        candidateCount: args.candidateWords.length,
        model: args.model
    });
    const stageStart = Date.now();

    const systemPrompt = SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION;
    const userPrompt = buildSearchAndSelectionUserPrompt({
        candidateWords: args.candidateWords,
        topicPreference: args.topicPreference,
        currentDate: args.currentDate
    });

    args.history.push({ role: 'user', parts: [{ text: userPrompt }] });

    const response = await safeGeminiCall('GeminiSearchAndSelection', async () => {
        return args.client.generateContent(args.model, {
            contents: args.history,
            generationConfig: {
                temperature: 1,
                // 注意：使用 googleSearch 工具时，不能强制 JSON 格式
                // Gemini 需要先执行搜索，然后以自然语言总结，最后我们从文本中提取 JSON
                thinkingConfig: {
                    includeThoughts: true,
                    thinkingLevel: geminiThinkingLevel
                }
            },
            tools: [{ googleSearch: {} }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
        });
    });
    console.log('[Gemini Stage 1/3] API response received in', Date.now() - stageStart, 'ms');

    const responseText = stripMarkdownCodeBlock(extractGeminiText(response));
    console.log('[Gemini Search+Selection] output_text (first 500 chars):', responseText.slice(0, 500));

    if (!responseText) throw new Error('Gemini returned empty search+selection response');

    let parsed: any;
    try {
        parsed = JSON.parse(responseText);
    } catch (e) {
        console.error('[Gemini Search+Selection] JSON Parse Error:', e);
        console.error('[Gemini Search+Selection] Full responseText:', responseText);
        throw new Error(`Failed to parse search+selection JSON: ${e}\nRaw (first 1000): ${responseText.slice(0, 1000)}`);
    }

    if (!Array.isArray(parsed.selected_words)) {
        console.error('[Gemini Search+Selection] Parsed object:', JSON.stringify(parsed, null, 2));
        throw new Error(`Invalid search+selection response: missing selected_words array\nParsed: ${JSON.stringify(parsed).slice(0, 500)}`);
    }

    const selectedWords = parsed.selected_words.filter((w: unknown) => typeof w === 'string');
    const newsSummary = typeof parsed.news_summary === 'string' ? parsed.news_summary : '';

    // 兼容处理：支持新的单一 source 字段和旧的 sources 数组字段
    let rawSources: string[] = [];
    if (typeof parsed.source === 'string' && parsed.source) {
        // 新格式：单一来源
        rawSources = [parsed.source];
    } else if (Array.isArray(parsed.sources)) {
        // 旧格式：多来源（向后兼容）
        rawSources = parsed.sources.filter((s: unknown) => typeof s === 'string');
    }

    if (selectedWords.length === 0) {
        console.error('[Gemini Search+Selection] No valid words in parsed.selected_words:', parsed.selected_words);
        throw new Error('No words selected from candidates');
    }

    if (!newsSummary) {
        console.error('[Gemini Search+Selection] Missing news_summary in response');
        throw new Error('No news summary provided');
    }

    // 收集所有可能的 URL 来源
    const allUrls = Array.from(
        new Set([
            ...rawSources,
            ...extractHttpUrlsFromText(newsSummary),
            ...collectHttpUrlsFromUnknown(response)
        ])
    ).slice(0, SOURCE_URL_LIMIT);

    // 解析 Google 重定向 URL，获取真实来源地址
    const sourceUrls = await resolveRedirectUrls(allUrls);

    console.log('[Gemini Search+Selection] Selected words:', selectedWords);
    console.log('[Gemini Search+Selection] Resolved', sourceUrls.length, 'source URL(s):', sourceUrls);

    args.history.push({ role: 'model', parts: [{ text: responseText }] });
    return {
        history: args.history,
        selectedWords,
        newsSummary,
        sourceUrls,
        usage: response.usageMetadata ?? null
    };
}

// Stage 2: 草稿生成
export async function runGeminiDraftGeneration(args: {
    client: GeminiClient;
    model: string;
    selectedWords: string[];
    newsSummary: string;
    sourceUrls: string[];
    currentDate: string;
    topicPreference: string;
}) {
    console.log('[Gemini Stage 2/3] Draft Generation - START', {
        wordCount: args.selectedWords.length,
        sourceUrlCount: args.sourceUrls.length
    });
    const stageStart = Date.now();

    // 阶段二不继承历史，创建新对话
    const history: GeminiHistory = [];

    const userPrompt = buildDraftGenerationUserPrompt({
        selectedWords: args.selectedWords,
        newsSummary: args.newsSummary,
        sourceUrls: args.sourceUrls,
        currentDate: args.currentDate,
        topicPreference: args.topicPreference
    });

    history.push({ role: 'user', parts: [{ text: userPrompt }] });

    const response = await safeGeminiCall('GeminiDraftGeneration', async () => {
        return args.client.generateContent(args.model, {
            contents: history,
            generationConfig: {
                temperature: 1,
                thinkingConfig: {
                    includeThoughts: true,
                    thinkingLevel: geminiThinkingLevel
                }
            },
            systemInstruction: { parts: [{ text: DRAFT_SYSTEM_INSTRUCTION }] }
        });
    });
    console.log('[Gemini Stage 2/3] API response received in', Date.now() - stageStart, 'ms');

    const draftText = extractGeminiText(response).trim();
    if (!draftText) throw new Error('Gemini returned empty draft content');

    console.log('[Gemini Draft] Generated', draftText.length, 'characters');

    return {
        draftText,
        usage: response.usageMetadata ?? null
    };
}

// Stage 3: JSON 转换
export async function runGeminiJsonConversion(args: {
    client: GeminiClient;
    model: string;
    draftText: string;
    sourceUrls: string[];
    selectedWords: string[];
}): Promise<{ output: DailyNewsOutput; usage: unknown }> {
    console.log('[Gemini Stage 3/3] JSON Conversion - START', { draftLength: args.draftText.length });
    const stageStart = Date.now();

    // 阶段三也不继承历史，创建新对话
    const history: GeminiHistory = [];

    const userPrompt = buildJsonConversionUserPrompt({
        draftText: args.draftText,
        sourceUrls: args.sourceUrls,
        selectedWords: args.selectedWords
    });

    history.push({ role: 'user', parts: [{ text: userPrompt }] });

    const response = await safeGeminiCall('GeminiJsonConversion', async () => {
        return args.client.generateContent(args.model, {
            contents: history,
            generationConfig: {
                temperature: 1,
                responseMimeType: 'application/json',
                thinkingConfig: {
                    includeThoughts: true,
                    thinkingLevel: geminiThinkingLevel
                }
            },
            systemInstruction: { parts: [{ text: JSON_SYSTEM_INSTRUCTION }] }
        });
    });
    console.log('[Gemini Stage 3/3] API response received in', Date.now() - stageStart, 'ms');

    const content = stripMarkdownCodeBlock(extractGeminiText(response));
    if (!content) throw new Error('Gemini returned empty content');

    const parsed: unknown = JSON.parse(content);

    const result = dailyNewsOutputSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(`Invalid Gemini JSON output: ${result.error.message}`);
    }

    return {
        output: normalizeDailyNewsOutput(result.data),
        usage: response.usageMetadata ?? null
    };
}
