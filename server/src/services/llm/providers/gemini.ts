/**
 * Gemini Provider (Google Vertex AI/Studio REST API 实现)
 * 
 * 核心设计：
 * 不使用 Google 官方 Node.js SDK，而是直接封装 fetch 请求。
 * 原因：为了更精细地控制底层网络行为（如 Fetch 的 signal、timeouts、HTTP 代理支持），
 * 以及处理官方 SDK 可能未及时跟进的 Beta 特性（如 Thinking Config, Search Tool 自定义参数）。
 */

import type { DailyNewsProvider, GenerateOptions, GenerateResponse, Stage1Input, Stage1Output, Stage2Input, Stage2Output, Stage3Input, Stage3Output, Stage4Input, Stage4Output } from '../types';
import {
    Stage1OutputSchema,
    Stage2OutputSchema,
    Stage3OutputSchema
} from '../../../schemas/stage_io';
import {
    SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
    DRAFT_SYSTEM_INSTRUCTION,
    JSON_SYSTEM_INSTRUCTION,
    buildSearchAndSelectionUserPrompt,
    buildDraftGenerationUserPrompt,
    buildJsonConversionUserPrompt
} from '../prompts';
import { extractHttpUrlsFromText, resolveRedirectUrls } from '../utils';
import { runSentenceAnalysis } from '../analyzer';

// 35 分钟超时
const GEMINI_TIMEOUT_MS = 35 * 60 * 1000;

export type GeminiMessage = {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
};

export type GeminiRequest = {
    contents: GeminiMessage[];
    systemInstruction?: { parts: Array<{ text: string }> };
};

export type GeminiApiResponse = {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string; thought?: boolean }>;
            role?: string;
        };
        finishReason?: string;
        groundingMetadata?: any;
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    };
    error?: { code: number; message: string; status: string };
};

export class GeminiProvider implements DailyNewsProvider {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(apiKey: string, model: string, baseUrl?: string) {
        if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
        if (!baseUrl) throw new Error('Missing GEMINI_BASE_URL');

        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    // ============ Generic Generate ============

    async generate(options: GenerateOptions): Promise<GenerateResponse> {
        // 构建 URL: baseUrl/v1beta/models/MODEL:generateContent
        const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent`;

        console.log(`[Gemini] Calling: ${url}`);

        const controller = new AbortController();
        // 设置超长超时 (35m)，因为 Stage 3/4 的整批处理可能极其耗时，
        // 且 Google 的 Thinking Model 有时会“思考”很久。
        const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        // 构建请求体
        const request: GeminiRequest = {
            contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
        };

        if (options.system) {
            request.systemInstruction = { parts: [{ text: options.system }] };
        }

        // 工具配置: Google Search
        // Gemini 2.0 具有内置的 Grounding 能力。我们在这里显式启用，
        // 确保即使 Prompt 没有显式要求，模型也能访问实时信息。
        const tools = options.config?.tools || [{ googleSearch: {} }];

        // 配置: Thinking 默认为 high
        const generationConfig = {
            temperature: 1,
            thinkingConfig: {
                includeThoughts: true,
                thinkingLevel: 'high'
            },
            ...options.config?.generationConfig
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey,
                },
                body: JSON.stringify({
                    generationConfig,
                    ...request,
                    tools
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                // console.error(`[Gemini] HTTP ${response.status}:`, errorText);
                throw new Error(`Gemini API Error: ${response.status} - ${errorText.slice(0, 500)}`);
            }

            const data = await response.json() as GeminiApiResponse;

            if (data.error) {
                throw new Error(`Gemini API Error: ${data.error.code} - ${data.error.message}`);
            }

            // 提取核心文本
            // Gemini API 返回的数据结构中，"parts" 数组可能混合包含：
            // 1. { thought: true, text: "..." } -> 思维链内容 (CoT)
            // 2. { text: "..." } -> 最终回答内容
            // 
            // 我们需要过滤掉 thought 部分，只返回最终的 JSON 文本给 Pipeline 解析。
            // 否则 JSON.parse 会因为包含自然语言的思考过程而失败。
            const text = this.extractText(data);

            return {
                text,
                output: data,
                usage: data.usageMetadata ? {
                    inputTokens: data.usageMetadata.promptTokenCount,
                    outputTokens: data.usageMetadata.candidatesTokenCount,
                    totalTokens: data.usageMetadata.totalTokenCount,
                } : undefined,
            };
        } catch (e) {
            clearTimeout(timeoutId);
            if (e instanceof Error && e.name === 'AbortError') {
                throw new Error(`Gemini Timeout: Request timed out after ${GEMINI_TIMEOUT_MS / 1000 / 60} minutes.`);
            }
            throw e;
        }
    }

    // ============ 4 个阶段的实现 ============

    async runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output> {
        console.log('[Gemini] Running Stage 1: Search & Selection');
        const userPrompt = buildSearchAndSelectionUserPrompt({
            candidateWords: input.candidateWords,
            topicPreference: input.topicPreference,
            currentDate: input.currentDate,
            recentTitles: input.recentTitles
        });

        // Stage 1 Explicitly enables Google Search (redundant if default, but safe)
        const response = await this.generate({
            system: SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
            prompt: userPrompt,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const cleanJson = this.stripMarkdownCodeBlock(response.text);
        const parsed = JSON.parse(cleanJson);
        const validated = Stage1OutputSchema.parse(validatedPayload(parsed));

        // URL Resolution Logic moved here from stages.ts
        const selectedWords = validated.selected_words;
        const newsSummary = validated.news_summary;

        let rawSources: string[] = [];
        if (validated.source) rawSources = [validated.source];
        else if (validated.sources) rawSources = validated.sources;

        // Extract URLs from text and grounding metadata (if available in raw output)
        // Note: Generic generate returns raw 'output' in GenerateResponse
        const groundingUrls = this.extractGroundingUrls(response.output);
        const textUrls = extractHttpUrlsFromText(newsSummary).concat(extractHttpUrlsFromText(response.text));

        const allUrls = Array.from(new Set([
            ...rawSources,
            ...textUrls,
            ...groundingUrls
        ])).slice(0, 5); // Limit sources

        const sourceUrls = await resolveRedirectUrls(allUrls);

        return {
            selectedWords,
            newsSummary,
            sourceUrls,
            usage: response.usage
        };
    }

    async runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output> {
        console.log('[Gemini] Running Stage 2: Draft Generation');
        const userPrompt = buildDraftGenerationUserPrompt({
            selectedWords: input.selectedWords,
            newsSummary: input.newsSummary,
            sourceUrls: input.sourceUrls,
            currentDate: input.currentDate,
            topicPreference: input.topicPreference
        });

        const response = await this.generate({
            system: DRAFT_SYSTEM_INSTRUCTION,
            prompt: userPrompt,
            config: {
                tools: [{ googleSearch: {} }] // Search always on
            }
        });

        let draftText = response.text.trim();
        // Clean inline citations
        const citationRegex = /\[\s*\d+(?:,\s*\d+)*\s*\]/g;
        if (citationRegex.test(draftText)) {
            draftText = draftText.replace(citationRegex, '');
        }

        const validated = Stage2OutputSchema.parse({ draftText });

        return {
            draftText: validated.draftText,
            usage: response.usage
        };
    }

    async runStage3_JsonConversion(input: Stage3Input): Promise<Stage3Output> {
        console.log('[Gemini] Running Stage 3: JSON Conversion');
        const userPrompt = buildJsonConversionUserPrompt({
            draftText: input.draftText,
            sourceUrls: input.sourceUrls,
            selectedWords: input.selectedWords,
            topicPreference: input.topicPreference
        });

        const response = await this.generate({
            system: JSON_SYSTEM_INSTRUCTION,
            prompt: userPrompt,
            config: {
                tools: [{ googleSearch: {} }] // Search always on
            }
        });

        const cleanJson = this.stripMarkdownCodeBlock(response.text);
        const parsed = JSON.parse(cleanJson);
        // Additional normalization if needed, similar to normalizeDailyNewsOutput
        const validated = Stage3OutputSchema.parse(parsed);

        return {
            output: validated,
            usage: response.usage
        };
    }

    async runStage4_SentenceAnalysis(input: Stage4Input): Promise<Stage4Output> {
        console.log('[Gemini] Running Stage 4: Sentence Analysis');

        // 委托给共享的分析器逻辑，传入 'this' 作为 LLMProvider
        // 我们使用新的 ANALYSIS_SYSTEM_INSTRUCTION 强制 JSON 输出
        const result = await runSentenceAnalysis({
            client: this, // 'this' implements LLMProvider
            model: this.model,
            articles: input.articles,
            completedLevels: input.completedLevels,
            onLevelComplete: input.onLevelComplete
        });

        return result;
    }

    // ============ Helpers ============

    /**
     * 从 Gemini 响应中提取文本
     * 健壮提取: 拼接所有非 thought 的 text 部分。
     */
    private extractText(response: GeminiApiResponse): string {
        let text = '';

        if (response.candidates?.[0]?.content?.parts) {
            text = response.candidates[0].content.parts
                .filter(p => p.text && !p.thought)
                .map(p => p.text)
                .join('');
        }

        if (!text) {
            console.warn('[Gemini] Extracted text is empty. FULL RESPONSE:', JSON.stringify(response, null, 2));
        }

        return text;
    }

    /**
     * 剥离 markdown 代码块包装
     */
    private stripMarkdownCodeBlock(text: string): string {
        const trimmed = text.trim();
        // 匹配 ```json\n...\n``` 或 ```\n...\n```
        const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
        if (match && match[1]) {
            return match[1].trim();
        }
        // Fallback: extract from first { to last }
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }

    private extractGroundingUrls(_response: GeminiApiResponse): string[] {
        // Logic to extract URLs from groundingMetadata if strictly needed
        // For now return empty or implement if we find useful metadata structure
        return [];
    }
}

// Helper to make Stage 1 validation more lenient if needed
function validatedPayload(parsed: any) {
    // If strict Zod fails, we might need the normalization logic from utils.ts
    // For now assuming LLM follows schema.
    return parsed;
}

