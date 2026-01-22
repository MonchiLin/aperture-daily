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
    JSON_SYSTEM_INSTRUCTION,
    buildJsonConversionUserPrompt
} from '../prompts.shared';
import { stripCitations, extractJson, buildSourceUrls } from '../utils';
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

        // Responses API with search
        const response = await this.generate({
            prompt: input.userPrompt,
            system: input.systemPrompt,
            config: {
                tools: [{ type: 'web_search' }]
            }
        });

        const cleanJson = extractJson(response.text);
        const parsed = JSON.parse(cleanJson);
        const validated = Stage1OutputSchema.parse(parsed);

        // 使用共享函数处理 URL
        const selectedWords = validated.selected_words;
        const newsSummary = validated.news_summary;
        const sourceUrls = await buildSourceUrls({
            validated,
            newsSummary,
            responseText: response.text
        });

        return {
            selectedWords,
            newsSummary,
            sourceUrls,
            usage: response.usage
        };
    }

    async runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output> {
        console.log('[OpenAI] Running Stage 2: Draft Generation');

        const response = await this.generate({
            prompt: input.userPrompt,
            system: input.systemPrompt,
            config: {
                tools: [{ type: 'web_search' }]
            }
        });

        let draftText = stripCitations(response.text.trim());

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
            selectedWords: input.selectedWords,
            topicPreference: input.topicPreference  // 用于设置输出 JSON 的 topic 字段
        });

        const response = await this.generate({
            prompt: userPrompt,
            system: JSON_SYSTEM_INSTRUCTION,
            config: {
                tools: [{ type: 'web_search' }]
            }
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

}

