/**
 * Claude Provider (Custom Proxy Implementation)
 * 
 * Supports specific proxy headers and behavior requested by user:
 * - BaseURL: https://hf2025-antigravity.hf.space
 * - Headers: anthropic-beta, x-title, etc.
 * - Tools: Custom tool types
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

// Constants from user request
const DEFAULT_BASE_URL = 'https://hf2025-antigravity.hf.space';
const DEFAULT_HEADERS = {
    'accept': '*/*',
    'accept-language': 'zh-CN',
    'anthropic-beta': 'interleaved-thinking-2025-05-14',
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'http-referer': 'https://cherry-ai.com',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'x-title': 'Cherry Studio'
};

interface ClaudeMessage {
    role: 'user' | 'assistant';
    content: string | Array<{ type: string; text: string }>;
}

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

        // Default Tool: Web Search (Custom type matching user request)
        // Note: The user provided type "web_search_20250305". We use this if tools are enabled.
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
            system: options.system, // Top-level system
            tools: tools,
            tool_choice: { type: "auto" },
            stream: true // Force stream: true as proven working
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

            // Always handle as stream since we forced stream: true
            console.log('[Claude] Streaming response...');
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

            // Fallback if text is empty but we have thinking (sometimes happens on error or filter)
            if (!accumulatedText && accumulatedThinking) {
                console.warn('[Claude] Warning: No text content, but thinking captured.');
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

    // ============ Implementation of 4 Stages ============

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
            topicPreference: input.topicPreference
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
