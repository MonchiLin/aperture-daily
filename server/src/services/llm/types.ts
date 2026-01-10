
import type { DailyNewsOutput } from '../../schemas/dailyNews';
import type { ArticleWithAnalysis } from './analyzer';


export interface PipelineConfig {
    thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
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

export interface LLMProvider {
    generate(options: GenerateOptions): Promise<GenerateResponse>;
}

// ============ 阶段 I/O 类型定义 ============

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// 阶段 1 (搜索)
export interface Stage1Input {
    candidateWords: string[];
    topicPreference: string;
    currentDate: string;
    recentTitles?: string[];
    config?: any;
}

export interface Stage1Output {
    selectedWords: string[];
    newsSummary: string;
    sourceUrls: string[];
    usage?: TokenUsage;
}

// 阶段 2 (草稿)
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

// 阶段 3 (转换)
export interface Stage3Input {
    draftText: string;
    sourceUrls: string[];
    selectedWords: string[];
    config?: any;
}

export interface Stage3Output {
    output: DailyNewsOutput;
    usage?: TokenUsage;
}

// 阶段 4 (分析)
export interface Stage4Input {
    articles: any[]; // 来自 analyzer.ts 的 ArticleInput
    model?: string;
    completedLevels?: any[];
    onLevelComplete?: (completedArticles: any[]) => Promise<void>;
    config?: any;
}

export interface Stage4Output {
    articles: ArticleWithAnalysis[];
    usage?: Record<string, TokenUsage>;
}

// ============ 统一 Provider 接口 ============

/**
 * DailyNews 核心 Provider 接口
 * 
 * 任何 LLM Provider (Gemini, OpenAI, Claude) 都必须实现此接口，
 * 以便在 Pipeline 中无缝切换。
 */
export interface DailyNewsProvider extends LLMProvider {
    runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output>;
    runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output>;
    runStage3_JsonConversion(input: Stage3Input): Promise<Stage3Output>;
    runStage4_SentenceAnalysis(input: Stage4Input): Promise<Stage4Output>;
}

