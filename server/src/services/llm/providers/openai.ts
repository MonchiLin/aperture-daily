/**
 * OpenAI Provider (OpenAI 原生支持)
 * 
 * 核心特性：
 * 1. 使用官方 `openai` Node.js SDK。
 * 2. 强制启用 `web_search` 工具：利用 OpenAI 强大的内置联网搜索能力，确保新闻的时效性。
 * 3. 实验性 Responses API 支持：虽然代码中保留了相关调用结构，但主要逻辑仍复用通用的 Stage IO。
 */

import OpenAI from 'openai';
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

export class OpenAIProvider implements DailyNewsProvider {
    private client: OpenAI;
    private model: string;

    constructor(apiKey: string, model: string, baseUrl?: string) {
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: baseUrl,
        });
        this.model = model;
    }

    async generate(options: GenerateOptions): Promise<GenerateResponse> {
        try {
            console.log('[OpenAI] Using Responses API (forced)...');

            // [Prompt Engineering]
            // 将 System Prompt 和 User Prompt 合并。
            // 某些 OpenAI 模型/端点对 System 角色支持不同，这种拼接方式通常更稳健。
            const fullInput = options.system
                ? `${options.system}\n\n${options.prompt}`
                : options.prompt;

            const response = await this.client.responses.create({
                model: this.model,
                tools: options.config?.tools || [{ type: 'web_search' }],
                input: fullInput,
                // reasoning: { effort: "xhigh" }, // Only for reasoning models?
                // max_output_tokens: 128000,
            });

            return {
                text: response.output_text || '',
                output: response.output_text,
                usage: response.usage,
            };

        } catch (error: any) {
            console.error('[OpenAI] Generation failed:', error);
            if (error.response) {
                console.error('[OpenAI] Error Response Headrs:', error.response.headers);
                console.error('[OpenAI] Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            }
            throw error;
        }
    }

    // ============ Implementation of 4 Stages ============

    async runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output> {
        console.log('[OpenAI] 执行阶段 1: 搜索与选题');

        // [Stage 1 Strategy]
        // 目标：从候选词生成新闻摘要和选题。
        // 工具：强制开启 `web_search`，让模型先搜索最新的相关新闻，再做决策。
        // 目前为为了保持跨模型一致性，我们要求输出 JSON 字符串，而不是直接使用 OpenAI Functions (虽然那样更结构化)，
        // 这样可以复用通用的 Zod Schema 校验逻辑。

        const userPrompt = buildSearchAndSelectionUserPrompt({
            candidateWords: input.candidateWords,
            topicPreference: input.topicPreference,
            currentDate: input.currentDate,
            recentTitles: input.recentTitles
        });

        // Responses API with search
        const response = await this.generate({
            prompt: userPrompt,
            system: SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
            config: {
                tools: [{ type: 'web_search' }]
            }
        });

        const cleanJson = this.stripMarkdownCodeBlock(response.text);
        const parsed = JSON.parse(cleanJson);
        const validated = Stage1OutputSchema.parse(parsed);

        // URL logic
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
        console.log('[OpenAI] Running Stage 2: Draft Generation');
        const userPrompt = buildDraftGenerationUserPrompt({
            selectedWords: input.selectedWords,
            newsSummary: input.newsSummary,
            sourceUrls: input.sourceUrls,
            currentDate: input.currentDate,
            topicPreference: input.topicPreference
        });

        const response = await this.generate({
            prompt: userPrompt,
            system: DRAFT_SYSTEM_INSTRUCTION,
            config: {
                tools: [{ type: 'web_search' }]
            }
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
        console.log('[OpenAI] Running Stage 3: JSON Conversion');
        const userPrompt = buildJsonConversionUserPrompt({
            draftText: input.draftText,
            sourceUrls: input.sourceUrls,
            selectedWords: input.selectedWords
        });

        const response = await this.generate({
            prompt: userPrompt,
            system: JSON_SYSTEM_INSTRUCTION,
            config: {
                tools: [{ type: 'web_search' }]
            }
        });

        const cleanJson = this.stripMarkdownCodeBlock(response.text);
        const parsed = JSON.parse(cleanJson);
        const validated = Stage3OutputSchema.parse(parsed);

        return {
            output: validated,
            usage: response.usage
        };
    }

    async runStage4_SentenceAnalysis(input: Stage4Input): Promise<Stage4Output> {
        console.log('[OpenAI] Running Stage 4: Sentence Analysis');

        // Use analyzer logic. 'this' satisfies LLMProvider.
        // OpenAI also needs to ensure search is ON but JSON is forced.
        // The prompt in analyzer.ts (buildParagraphPrompt) assumes text output.
        // We might need to inject strict system instructions here too?
        // analyzer.ts calls client.generate({ system: ... }). 
        // OpenAI.generate will prepend that system prompt.
        // We should ensure OpenAI.generate respects the prompt sent by analyzer.ts.

        const result = await runSentenceAnalysis({
            client: this,
            model: this.model,
            articles: input.articles,
            completedLevels: input.completedLevels,
            onLevelComplete: input.onLevelComplete
        });

        return result;
    }

    private stripMarkdownCodeBlock(text: string): string {
        const trimmed = text.trim();
        const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
        if (match && match[1]) {
            return match[1].trim();
        }
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }
}

