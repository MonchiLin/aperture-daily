/**
 * LLM Cross-Provider Client (LLM 客户端门面)
 * 
 * 设计模式：Facade (门面模式) + Factory (工厂模式)
 * 
 * 核心职责：
 * 1. 统一接口：对外屏蔽 Gemini(REST), Claude(Proxy), OpenAI(SDK) 的实现差异。
 * 2. 动态切换：支持基于配置 (Config) 在运行时无缝切换不同的模型提供商。
 * 3. 类型安全：强制所有 Provider 必须实现 `DailyNewsProvider` 接口，确保 Pipeline 的稳定性。
 */

import { GeminiProvider } from './providers/gemini';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import type { DailyNewsProvider, GenerateOptions, GenerateResponse, Stage1Input, Stage1Output, Stage2Input, Stage2Output, Stage3Input, Stage3Output, Stage4Input, Stage4Output } from './types';

// 向消费者重新导出类型
export type { GenerateOptions, GenerateResponse };

export type LLMProviderType = 'gemini' | 'openai' | 'claude';

export interface LLMClientConfig {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl?: string;
    model: string;
}

export class LLMClient implements DailyNewsProvider {
    // 委托 (Delegation)：主要逻辑转发给具体的 Provider 实例
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
 * 创建 LLM 客户端的工厂函数
 */
export function createClient(config: LLMClientConfig) {
    return new LLMClient(config);
}



