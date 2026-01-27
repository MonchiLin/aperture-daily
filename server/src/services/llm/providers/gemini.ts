/**
 * [Gemini Provider Implementation (Google Vertex AI / AI Studio)]
 * ------------------------------------------------------------------
 * 核心决策：**Bypass SDK, Use Raw Fetch**
 *
 * 原因 (Architectural Decision Record):
 * 1. **生命周期控制 (Lifecycle)**: 官方 SDK 对 Fetch 的封装过深，难以精确控制 `AbortSignal` 和 Socket 超时。
 * 2. **Beta 特性跟进 (Velocity)**: Deep Thinking (CoT) 和 Dynamic Search Config 往往在 REST API 最先发布，SDK 滞后。
 * 3. **网络对策 (Network)**: Raw Fetch 允许我们在更底层注入 Proxy Agent 或 Custom Headers。
 */

import type {
    DailyNewsProvider, GenerateOptions, GenerateResponse,
    Stage1Input, Stage1Output,
    Stage2aInput, Stage2aOutput,
    Stage2bInput, Stage2bOutput,
    Stage2Input, Stage2Output,
    Stage3Input, Stage3Output,
    Stage4Input, Stage4Output
} from '../types';
import {
    Stage1OutputSchema,
    Stage2OutputSchema,
    Stage3OutputSchema
} from '../../../schemas/stage_io';
import {
    JSON_SYSTEM_INSTRUCTION,
    buildJsonConversionUserPrompt
} from '../prompts.shared';
import { stripCitations, extractJson, buildSourceUrls } from '../utils';
import { runSentenceAnalysis } from '../analyzer';

// 超时设置：35分钟
// 原因：Stage 4 (语法分析) 涉及 3 篇文章的深度 NLP 处理，且 "Thinking" 模型有时会“思考”数分钟。
// 宁可长时间等待也不希望其中断，配合 Checkpoint 机制保证最终一致性。
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
        // 启动看门狗计时器 (Watchdog Timer)
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
        const tools = options.config?.tools || [{ urlContext: {} }, { googleSearch: {} }];

        // 配置: Thinking 默认为 high, 最大输出 65536 tokens
        const generationConfig = {
            temperature: 1,
            maxOutputTokens: 64000,  // Gemini 3 Pro 最大输出长度
            // Thinking Config (思维链配置)
            // 启用 High Level 思考，显著提升复杂指令 (如 Stage 2 写作和 Stage 4 语法分析) 的遵循度。
            // 代价是延迟增加 10-30 秒。
            thinkingConfig: {
                includeThoughts: true, // 必须为 true 才能触发思考，但在 extractText 中会被我们过滤掉
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

            // [Content Extraction Strategy]
            // 挑战：Flash Thinking 模型返回混合流 (Mixed Stream)。
            // 解决：**Strict Filtering** (严格过滤)。
            // 逻辑：我们只关心最终的 `text`，必须剔除 `thought: true` 的推理过程，以免污染 JSON Parser。
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

        // Stage 1 Explicitly enables Google Search
        const response = await this.generate({
            system: input.systemPrompt,
            prompt: input.userPrompt
        });

        const cleanJson = extractJson(response.text);
        const parsed = JSON.parse(cleanJson);
        const validated = Stage1OutputSchema.parse(parsed);

        const selectedWords = validated.selected_words;
        const newsSummary = validated.news_summary;
        const originalStyleSummary = validated.original_style_summary; // [NEW] Style DNA
        const sourceUrls = await buildSourceUrls({
            validated,
            newsSummary,
            responseText: response.text,
            groundingUrls: this.extractGroundingUrls(response.output)
        });

        // Resolve RSS Item if ID is returned
        let selectedRssItem: any | undefined;
        let selectedRssId: number | undefined;

        if (validated.selected_rss_id && input.newsCandidates) {
            // ID is 1-based index from Prompt
            const index = validated.selected_rss_id - 1;
            if (index >= 0 && index < input.newsCandidates.length) {
                selectedRssItem = input.newsCandidates[index];
                selectedRssId = validated.selected_rss_id;
                console.log(`[Gemini] Matched RSS Item: [${selectedRssItem.sourceName}] ${selectedRssItem.title}`);
            }
        }

        return {
            selectedWords,
            newsSummary,
            originalStyleSummary,
            sourceUrls,
            selectedRssId,
            selectedRssItem,
            usage: response.usage
        };
    }

    // [New] Stage 2a: Blueprint Generation
    async runStage2a_Blueprint(input: Stage2aInput): Promise<Stage2aOutput> {
        console.log('[Gemini] Running Stage 2a: Architect (Blueprint)');

        const response = await this.generate({
            system: input.systemPrompt,
            prompt: input.userPrompt,
            config: input.config
        });

        // 提取 XML Blueprint
        let blueprintXml = response.text.trim();
        // 如果包含 markdown code block, 则提取
        const codeBlockMatch = blueprintXml.match(/```xml\n?([\s\S]*?)\n?```/i);
        if (codeBlockMatch && codeBlockMatch[1]) {
            blueprintXml = codeBlockMatch[1].trim();
        }

        return {
            blueprintXml,
            usage: response.usage
        };
    }

    // [New] Stage 2b: Writer (Draft Generation)
    async runStage2b_Draft(input: Stage2bInput): Promise<Stage2bOutput> {
        console.log('[Gemini] Running Stage 2b: Writer (Draft)');

        const response = await this.generate({
            system: input.systemPrompt,
            prompt: input.userPrompt,
            config: input.config
        });

        // Draft Text is pure text, strip citations if any
        let draftText = stripCitations(response.text.trim());

        // Basic validation: Check length
        if (draftText.length < 100) {
            console.warn('[Gemini] Draft text unusually short:', draftText);
        }

        return {
            draftText,
            usage: response.usage
        };
    }

    /**
     * @deprecated Legacy Stage 2 (Draft Generation)
     * Replaced by runStage2a_Blueprint + runStage2b_Draft
     */
    async runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output> {
        console.log('[Gemini] Running Stage 2: Draft Generation (DEPRECATED)');

        const response = await this.generate({
            system: input.systemPrompt,
            prompt: input.userPrompt
        });

        let draftText = stripCitations(response.text.trim());

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
            prompt: userPrompt
        });

        const cleanJson = extractJson(response.text);
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



    private extractGroundingUrls(_response: GeminiApiResponse): string[] {
        // Logic to extract URLs from groundingMetadata if strictly needed
        // For now return empty or implement if we find useful metadata structure
        return [];
    }
}
