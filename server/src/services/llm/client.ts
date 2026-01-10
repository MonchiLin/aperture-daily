/**
 * LLM 客户端门面 (Client Facade)
 *
 * 设计模式：Facade（门面） + Factory（工厂） + Delegation（委托）
 *
 * 核心职责：
 * 1. 统一接口：对外屏蔽 Gemini/Claude/OpenAI 的实现差异
 *    - Gemini: REST API + 自定义 fetch（更精细控制）
 *    - Claude: 反向代理 + SSE 流式（网络限制）
 *    - OpenAI: 官方 SDK + Responses API
 *
 * 2. 动态切换：基于配置在运行时无缝切换 Provider
 *    - 支持 A/B 测试不同模型效果
 *    - 支持根据任务类型选择最优 Provider
 *
 * 3. 类型安全：强制所有 Provider 实现 DailyNewsProvider 接口
 *    - 4 个阶段方法签名固定，Pipeline 不感知底层实现
 *    - 新增 Provider 只需实现接口，无需修改 Pipeline 代码
 *
 * 为什么用门面模式而非直接使用 Provider？
 * - 隔离变化：LLM API 频繁更新，门面层吸收兼容性处理
 * - 统一日志/监控：可在此层插入通用逻辑
 * - 简化调用方：executor.ts 只需 createClient(config)
 */

import { GeminiProvider } from './providers/gemini';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import type { DailyNewsProvider, GenerateOptions, GenerateResponse, Stage1Input, Stage1Output, Stage2Input, Stage2Output, Stage3Input, Stage3Output, Stage4Input, Stage4Output } from './types';

export type { GenerateOptions, GenerateResponse };

export type LLMProviderType = 'gemini' | 'openai' | 'claude';

export interface LLMClientConfig {
    provider: LLMProviderType;
    apiKey: string;
    baseUrl?: string;
    model: string;
}

/**
 * LLM 客户端类
 *
 * 采用委托模式：所有方法调用转发给内部 Provider 实例。
 * 客户端本身不包含业务逻辑，仅做路由和类型保证。
 */
export class LLMClient implements DailyNewsProvider {
    private provider: DailyNewsProvider;
    private config: LLMClientConfig;

    constructor(config: LLMClientConfig) {
        this.config = config;
        this.provider = this.createProvider(config);
    }

    /**
     * 工厂方法：根据配置创建对应的 Provider 实例
     *
     * 扩展点：新增 Provider 时在此添加 case 分支
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
    // 以下方法全部委托给内部 Provider，无额外逻辑
    // ─────────────────────────────────────────────────────────────

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
 *
 * 推荐用法：executor.ts 统一通过此函数创建客户端
 * 避免直接 new LLMClient()，便于后续加入缓存/池化逻辑
 */
export function createClient(config: LLMClientConfig) {
    return new LLMClient(config);
}




