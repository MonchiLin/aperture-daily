/**
 * LLM Client - Unified Facade for Multiple Providers
 * 
 * Delegates to specific provider implementations:
 * - Gemini -> providers/gemini.ts (Genkit)
 * - Claude -> providers/claude.ts (Genkit)
 * - OpenAI -> providers/openai.ts (Native SDK)
 */

import { GeminiProvider } from './providers/gemini';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import type { LLMProvider, GenerateOptions, GenerateResponse } from './types';

// Re-export types for consumers
export type { GenerateOptions, GenerateResponse };

export type LLMProviderType = 'gemini' | 'openai' | 'claude';

export interface LLMClientConfig {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl?: string;
    model: string;
}

export class LLMClient {
    private provider: LLMProvider;
    private config: LLMClientConfig;

    constructor(config: LLMClientConfig) {
        this.config = config;
        this.provider = this.createProvider(config);
    }

    private createProvider(config: LLMClientConfig): LLMProvider {
        switch (config.provider) {
            case 'gemini':
                return new GeminiProvider(config.apiKey, config.model, config.baseUrl);
            case 'openai':
                return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
            case 'claude':
                return new ClaudeProvider(config.apiKey, config.model);
            default:
                throw new Error(`Unsupported provider: ${config.provider}`);
        }
    }

    async generate(options: GenerateOptions): Promise<GenerateResponse> {
        return this.provider.generate(options);
    }

    get modelName() {
        return this.config.model;
    }
}

/**
 * Factory function to create an LLM client
 */
export function createClient(config: LLMClientConfig) {
    return new LLMClient(config);
}
