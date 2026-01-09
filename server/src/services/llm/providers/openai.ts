/**
 * OpenAI Provider (Native Implementation)
 * 
 * Directly uses 'openai' SDK to support advanced features like:
 * - Responses API (experimental)
 * - Native Tool Calling with 'web_search'
 */

import OpenAI from 'openai';
import type { LLMProvider, GenerateOptions, GenerateResponse } from '../types';

export class OpenAIProvider implements LLMProvider {
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
            console.log('[OpenAIProvider] Using Responses API (forced)...');

            // Combine system prompt with user prompt for Responses API
            const fullInput = options.system
                ? `${options.system}\n\n${options.prompt}`
                : options.prompt;

            const response = await this.client.responses.create({
                model: this.model,
                tools: [{ type: 'web_search' }],
                input: fullInput,
                reasoning: {
                    effort: "xhigh"
                },
                max_output_tokens: 128000, // Request large token window for reasoning models
            });

            return {
                text: response.output_text || '',
                output: response.output_text,
                usage: response.usage,
            };

        } catch (error: any) {
            console.error('[OpenAIProvider] Generation failed:', error);
            if (error.response) {
                console.error('[OpenAIProvider] Error Response Headrs:', error.response.headers);
                // OpenAI SDK error usually puts data in error.error or similar, but log full object
                console.error('[OpenAIProvider] Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            }
            throw error;
        }
    }

    private extractExtraConfig(config?: Record<string, any>) {
        if (!config) return {};
        // Remove known keys that we handled manually
        const { tools, googleSearchRetrieval, thinkingConfig, ...rest } = config;
        return rest;
    }
}
