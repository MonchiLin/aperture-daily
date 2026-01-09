
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

// ============ Stage I/O Types ============

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

// Stage 1
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

// Stage 2
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

// Stage 3
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

// Stage 4
export interface Stage4Input {
    articles: any[]; // ArticleInput from analyzer.ts
    model?: string;
    completedLevels?: any[];
    onLevelComplete?: (completedArticles: any[]) => Promise<void>;
    config?: any;
}

export interface Stage4Output {
    articles: ArticleWithAnalysis[];
    usage?: Record<string, TokenUsage>;
}

// ============ Unified Provider Interface ============

export interface DailyNewsProvider extends LLMProvider {
    runStage1_SearchAndSelection(input: Stage1Input): Promise<Stage1Output>;
    runStage2_DraftGeneration(input: Stage2Input): Promise<Stage2Output>;
    runStage3_JsonConversion(input: Stage3Input): Promise<Stage3Output>;
    runStage4_SentenceAnalysis(input: Stage4Input): Promise<Stage4Output>;
}

