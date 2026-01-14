/**
 * LLM 类型定义模块
 *
 * 本文件定义了 LLM 服务层的核心类型接口，是 Pipeline 与 Provider 之间的契约。
 *
 * 类型设计原则：
 * 1. 输入/输出分离：每个阶段有独立的 Input/Output 类型，便于类型推导和测试
 * 2. 可选字段显式标注：usage、config 等可选字段明确使用 `?`
 * 3. 接口继承：DailyNewsProvider 继承 LLMProvider，确保向后兼容
 */

import type { DailyNewsOutput } from '../../schemas/dailyNews';
import type { ArticleWithAnalysis } from './analyzer';

// ════════════════════════════════════════════════════════════════
// 配置类型
// ════════════════════════════════════════════════════════════════

/**
 * 流水线配置
 *
 * thinkingLevel: 控制 LLM 的"深度思考"程度
 * - LOW: 快速响应，适合简单任务
 * - MEDIUM: 平衡模式
 * - HIGH: 深度推理，适合复杂任务（如 Stage 1 选题）
 */
export interface PipelineConfig {
    thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface Topic {
    id: string;
    label: string;
    prompts?: string;
}

export interface GenerateOptions {
    prompt: string;
    system?: string;
    config?: Record<string, any>;
}

export interface GenerateResponse {
    text: string;
    output?: any;
    usage?: any;
}

/**
 * 基础 LLM 提供者接口
 *
 * 最小契约：只需实现 generate 方法即可作为 LLM 后端
 * 用于 analyzer.ts 等只需要基础生成能力的模块
 */
export interface LLMProvider {
    generate(options: GenerateOptions): Promise<GenerateResponse>;
}

// ════════════════════════════════════════════════════════════════
// Token 使用统计
// ════════════════════════════════════════════════════════════════

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// ════════════════════════════════════════════════════════════════
// 四阶段 I/O 类型定义
//
// 设计背景：
// 流水线分为 4 个阶段，每个阶段有明确的输入/输出类型。
// 这种设计使得：
// 1. 每个阶段可独立测试
// 2. Checkpoint 恢复只需保存阶段输出
// 3. 不同 Provider 实现可复用相同的类型校验
// ════════════════════════════════════════════════════════════════

export interface NewsItem {
    sourceId?: string; // [NEW] 关联 news_sources.id
    sourceName: string;
    title: string;
    link: string;
    summary: string;
    pubDate: string;
}

/**
 * Stage 1: 搜索与选词
 *
 * 输入：候选词列表、主题偏好
 * 输出：选定词汇、新闻摘要、来源 URL
 * 核心能力依赖：联网搜索（Gemini Google Search / OpenAI web_search）
 */
export interface Stage1Input {
    candidateWords: string[];
    topicPreference: string;
    currentDate: string;
    recentTitles?: string[];  // 避免与近期文章主题重复
    topics?: Topic[];
    newsCandidates?: NewsItem[]; // [NEW] RSS News Candidates
    config?: any;
}

export interface Stage1Output {
    selectedWords: string[];
    newsSummary: string;
    sourceUrls: string[];
    // RSS 选择追踪
    selectedRssId?: number;   // LLM 选中的 RSS 池 item id (1-indexed)
    selectedRssItem?: NewsItem; // Pipeline 根据 id 填充的完整 RSS 信息
    usage?: TokenUsage;
}

/**
 * Stage 2: 草稿生成
 *
 * 输入：Stage 1 的输出 + 上下文
 * 输出：纯文本草稿（3 个难度级别）
 * 特点：不要求 JSON 格式，让 LLM 专注内容创作
 */
export interface Stage2Input {
    selectedWords: string[];
    newsSummary: string;
    sourceUrls: string[];
    currentDate: string;
    topicPreference: string;
    config?: any;
}

export interface Stage2Output {
    draftText: string;
    usage?: TokenUsage;
}

/**
 * Stage 3: JSON 结构化转换
 *
 * 输入：纯文本草稿
 * 输出：结构化的 DailyNewsOutput（含标题、分级文章、词汇释义）
 * 关键约束：严格的 JSON Schema 校验
 */
export interface Stage3Input {
    draftText: string;
    sourceUrls: string[];
    selectedWords: string[];
    topicPreference: string;
    config?: any;
}

export interface Stage3Output {
    output: DailyNewsOutput;
    usage?: TokenUsage;
}

/**
 * Stage 4: 句法分析
 *
 * 输入：Stage 3 生成的文章列表
 * 输出：带语法分析结果的文章
 * 性能敏感：Token 消耗最大的阶段，支持增量 Checkpoint
 */
export interface Stage4Input {
    articles: any[];
    model?: string;
    completedLevels?: any[];  // 已完成分析的级别，用于增量恢复
    onLevelComplete?: (completedArticles: any[]) => Promise<void>;  // 每完成一个级别回调
    config?: any;
}

export interface Stage4Output {
    articles: ArticleWithAnalysis[];
    usage?: Record<string, TokenUsage>;
}

// ════════════════════════════════════════════════════════════════
// 统一 Provider 接口
// ════════════════════════════════════════════════════════════════

/**
 * 完整的 DailyNews Provider 接口
 *
 * 所有 LLM Provider（Gemini、Claude、OpenAI）必须实现此接口。
 *
 * 为什么继承 LLMProvider？
 * - 向后兼容：现有代码可能只依赖 generate 方法
 * - 渐进增强：可以先实现 generate，再逐步实现 4 个阶段方法
 *
 * 新增 Provider 时的步骤：
 * 1. 创建 providers/xxx.ts
 * 2. 实现 DailyNewsProvider 接口
 * 3. 在 client.ts 的 createProvider 中添加 case 分支
 */
export interface DailyNewsProvider extends LLMProvider {
    runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output>;
    runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output>;
    runStage3_JsonConversion(input: Stage3Input): Promise<Stage3Output>;
    runStage4_SentenceAnalysis(input: Stage4Input): Promise<Stage4Output>;
}


