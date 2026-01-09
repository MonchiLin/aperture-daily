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
import type { DailyNewsProvider, GenerateOptions, GenerateResponse, Stage1Input, Stage1Output, Stage2Input, Stage2Output, Stage3Input, Stage3Output, Stage4Input, Stage4Output } from './types';

// Re-export types for consumers
export type { GenerateOptions, GenerateResponse };

export type LLMProviderType = 'gemini' | 'openai' | 'claude';

export interface LLMClientConfig {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl?: string;
    model: string;
}

export class LLMClient implements DailyNewsProvider {
    private provider: DailyNewsProvider;
    private config: LLMClientConfig;

    constructor(config: LLMClientConfig) {
        this.config = config;
        this.provider = this.createProvider(config);
    }

    private createProvider(config: LLMClientConfig): DailyNewsProvider {
        switch (config.provider) {
            case 'gemini':
                return new GeminiProvider(config.apiKey, config.model, config.baseUrl);
            case 'openai':
                return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
            case 'claude':
                return new ClaudeProvider(config.apiKey, config.model, config.baseUrl);
            default:
                throw new Error(`Unsupported provider: ${config.provider}`);
        }
    }

    async generate(options: GenerateOptions): Promise<GenerateResponse> {
        return this.provider.generate(options);
    }

    async runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output> {
        return this.provider.runStage1_SearchAndSelection(input);
    }

    async runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output> {
        return this.provider.runStage2_DraftGeneration(input);
    }

    async runStage3_JsonConversion(input: Stage3Input): Promise<Stage3Output> {
        return this.provider.runStage3_JsonConversion(input);
    }

    async runStage4_SentenceAnalysis(input: Stage4Input): Promise<Stage4Output> {
        return this.provider.runStage4_SentenceAnalysis(input);
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



