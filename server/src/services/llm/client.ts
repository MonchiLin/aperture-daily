/**
 * LLM 客户端门面 (Client Facade)
 *
 * 核心架构: **Facade Pattern** (门面模式)
 *
 * 模块职责:
 * 1. **统一接入**: 屏蔽底层 Provider (Gemini/OpenAI/Claude) 的差异 (签名、流式API、错误码)。
 * 2. **未来扩展**: 作为所有 LLM 请求的唯一关口，便于未来统一接入 "L3 缓存"、"速率限制 (Rate Limit)" 或 "成本审计"。
 *
 * 没计哲学:
 * 客户端本身应是 "Thin Client" (瘦客户端)，只负责转发，具体的协议转换交给 `createProvider` 产生的实例处理。
 */

import { GeminiProvider } from './providers/gemini';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import type {
    DailyNewsProvider, GenerateOptions, GenerateResponse,
    Stage1Input, Stage1Output,
    Stage2aInput, Stage2aOutput,
    Stage2bInput, Stage2bOutput,
    Stage2Input, Stage2Output,
    Stage3Input, Stage3Output,
    Stage4Input, Stage4Output
} from './types';

export type { GenerateOptions, GenerateResponse };

export type LLMProviderType = 'gemini' | 'openai' | 'claude';

export interface LLMClientConfig {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl?: string;
    model: string;
}

/**
 * LLM 客户端实现
 * 采用 **委托模式 (Delegation)**：所有方法调用直接转发给内部的 Provider 实例。
 */
export class LLMClient implements DailyNewsProvider {
    private provider: DailyNewsProvider;
    private config: LLMClientConfig;

    constructor(config: LLMClientConfig) {
        this.config = config;
        this.provider = this.createProvider(config);
    }

    /**
     * Provider 工厂
     * 根据配置实例化对应的适配器。
     */
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

    // ─────────────────────────────────────────────────────────────
    // 代理方法 (Proxy Methods)
    // 保持接口纯净，透传所有请求。
    // ─────────────────────────────────────────────────────────────

    async generate(options: GenerateOptions): Promise<GenerateResponse> {
        return this.provider.generate(options);
    }

    async runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output> {
        return this.provider.runStage1_SearchAndSelection(input);
    }

    async runStage2a_Blueprint(input: Stage2aInput): Promise<Stage2aOutput> {
        return this.provider.runStage2a_Blueprint(input);
    }

    async runStage2b_Draft(input: Stage2bInput): Promise<Stage2bOutput> {
        return this.provider.runStage2b_Draft(input);
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
 * 客户端工厂入口
 * 建议优先使用此函数而非 `new LLMClient()`。
 */
export function createClient(config: LLMClientConfig) {
    return new LLMClient(config);
}




