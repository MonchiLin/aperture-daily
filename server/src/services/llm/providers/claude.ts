/**
 * Claude Provider (基于自定义反向代理的实现)
 * 
 * 架构背景：
 * 由于网络原因，本项目无法直接连接 Anthropic API，而是通过一个基于 Cloudflare/HuggingFace 的反向代理。
 * 该代理服务模拟了 OpenAI 的部分接口行为，但对 Header 和 Streaming 格式有特殊要求。
 * 
 * 关键兼容性处理：
 * 1. Headers: 必须模拟浏览器请求头 (sec-ch-ua, priority 等) 以绕过代理的 WAF 检查。
 * 2. Streaming: 代理强制开启 SSE (Server-Sent Events)，不支持传统的 Request/Response 模式。
 * 3. Thinking Protocol: 需要特殊处理 `thinking` 类型的数据块，区分“思考过程”与“最终文本”。
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
import { extractHttpUrlsFromText, resolveRedirectUrls, extractJson } from '../utils';
import { runSentenceAnalysis } from '../analyzer';

// 用户请求的常量定义
const DEFAULT_BASE_URL = 'https://hf2025-antigravity.hf.space';
const DEFAULT_HEADERS = {
    'accept': '*/*',
    'accept-language': 'zh-CN',
    'anthropic-beta': 'interleaved-thinking-2025-05-14', // 启用思维链 (CoT) 功能
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'http-referer': 'https://cherry-ai.com', // 代理白名单 Referer
    'priority': 'u=1, i',
    'sec-ch-ua': '"Not=A?Brand";v="24", "Chromium";v="140"', // 浏览器指纹伪造
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'x-title': 'Cherry Studio'
};

export class ClaudeProvider implements DailyNewsProvider {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(apiKey: string, model: string, baseUrl?: string) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    }

    async generate(options: GenerateOptions): Promise<GenerateResponse> {
        const url = `${this.baseUrl}/v1/messages`;

        console.log(`[Claude] Calling: ${url}`);

        // 默认工具: 网络搜索 (匹配用户请求的自定义类型)
        // 注意: 用户提供了类型 "web_search_20250305"。如果启用工具，我们将使用此类型。
        const defaultTools = [{
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5
        }];

        const tools = options.config?.tools || defaultTools;

        // Construct Body
        const body = {
            model: this.model,
            max_tokens: 64000,
            thinking: {
                type: "enabled",
                budget_tokens: 51404
            },
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: options.prompt }
                    ]
                }
            ],
            system: options.system,
            tools: tools,
            tool_choice: { type: "auto" },
            stream: true // 强制开启流式传输 (代理层要求)
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    ...DEFAULT_HEADERS,
                    'x-api-key': this.apiKey,
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Claude API Error: ${response.status} - ${errorText.slice(0, 500)}`);
            }

            // 由于我们强制开启了 stream: true，始终按流式处理
            console.log('[Claude] 正在接收流式响应...');
            const reader = response.body?.getReader();
            if (!reader) throw new Error('Response body is null');

            const decoder = new TextDecoder();
            let accumulatedText = '';
            let accumulatedThinking = '';
            let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(':')) continue; // skip keep-alive or empty

                    if (trimmed.startsWith('data: ')) {
                        const dataStr = trimmed.slice(6).trim();
                        if (dataStr === '[DONE]') continue;

                        try {
                            const event = JSON.parse(dataStr);

                            switch (event.type) {
                                case 'content_block_start':
                                    // 新的数据块开始，可能是文本，也可能是思考块
                                    if (event.content_block?.type === 'text') {
                                        accumulatedText += (event.content_block.text || '');
                                    } else if (event.content_block?.type === 'thinking') {
                                        accumulatedThinking += (event.content_block.thinking || '');
                                    }
                                    break;

                                case 'content_block_delta':
                                    if (event.delta?.type === 'text_delta') {
                                        accumulatedText += event.delta.text;
                                    } else if (event.delta?.type === 'thinking_delta') {
                                        accumulatedThinking += event.delta.thinking;
                                    }
                                    break;

                                case 'message_delta':
                                    if (event.usage) {
                                        usage.outputTokens = event.usage.output_tokens || 0;
                                    }
                                    break;

                                case 'message_start':
                                    if (event.message?.usage) {
                                        usage.inputTokens = event.message.usage.input_tokens || 0;
                                    }
                                    break;
                            }
                        } catch (e) {
                            // Suppress JSON parse errors for interspersed lines
                        }
                    }
                }
            }

            usage.totalTokens = usage.inputTokens + usage.outputTokens;

            // 兜底逻辑：如果文本为空但捕获到了思考过程（有时发生在错误或过滤时）
            if (!accumulatedText && accumulatedThinking) {
                console.warn('[Claude] 警告: 无文本内容，但捕获到了思考过程。');
            }

            return {
                text: accumulatedText,
                output: { text: accumulatedText, thinking: accumulatedThinking },
                usage
            };
        } catch (error) {
            console.error('[Claude] Generation failed:', error);
            throw error;
        }
    }

    // ============ 4 个阶段的实现 ============

    async runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output> {
        console.log('[Claude] Running Stage 1: Search & Selection');
        const userPrompt = buildSearchAndSelectionUserPrompt({
            candidateWords: input.candidateWords,
            topicPreference: input.topicPreference,
            currentDate: input.currentDate,
            recentTitles: input.recentTitles
        });

        const response = await this.generate({
            system: SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
            prompt: userPrompt
        });

        const cleanJson = extractJson(response.text);
        const parsed = JSON.parse(cleanJson);
        const validated = Stage1OutputSchema.parse(parsed);

        // URL logic matching other providers
        const selectedWords = validated.selected_words;
        const newsSummary = validated.news_summary;

        let rawSources: string[] = [];
        if (validated.source) rawSources = [validated.source];
        else if (validated.sources) rawSources = validated.sources;

        const textUrls = extractHttpUrlsFromText(newsSummary).concat(extractHttpUrlsFromText(response.text));

        const allUrls = Array.from(new Set([...rawSources, ...textUrls])).slice(0, 5);
        const sourceUrls = await resolveRedirectUrls(allUrls);

        return {
            selectedWords,
            newsSummary,
            sourceUrls,
            usage: response.usage
        };
    }

    async runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output> {
        console.log('[Claude] Running Stage 2: Draft Generation');
        const userPrompt = buildDraftGenerationUserPrompt({
            selectedWords: input.selectedWords,
            newsSummary: input.newsSummary,
            sourceUrls: input.sourceUrls,
            currentDate: input.currentDate,
        });

        const response = await this.generate({
            system: DRAFT_SYSTEM_INSTRUCTION,
            prompt: userPrompt
        });

        let draftText = response.text.trim();
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
        console.log('[Claude] Running Stage 3: JSON Conversion');
        const userPrompt = buildJsonConversionUserPrompt({
            draftText: input.draftText,
            sourceUrls: input.sourceUrls,
            selectedWords: input.selectedWords
        });

        const response = await this.generate({
            system: JSON_SYSTEM_INSTRUCTION,
            prompt: userPrompt
        });

        const cleanJson = extractJson(response.text);
        const parsed = JSON.parse(cleanJson);
        const validated = Stage3OutputSchema.parse(parsed);

        return {
            output: validated,
            usage: response.usage
        };
    }

    async runStage4_SentenceAnalysis(input: Stage4Input): Promise<Stage4Output> {
        console.log('[Claude] Running Stage 4: Sentence Analysis');

        const result = await runSentenceAnalysis({
            client: this,
            model: this.model,
            articles: input.articles,
            completedLevels: input.completedLevels,
            onLevelComplete: input.onLevelComplete
        });

        return result;
    }
}
