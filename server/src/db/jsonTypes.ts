/**
 * JSON Column Types
 * 
 * Defines strict TypeScript interfaces for JSON columns in the database.
 * Independent of the application layer to avoid circular dependencies.
 */

export interface CheckpointContext {
    stage: 'search_selection' | 'draft' | 'conversion' | 'grammar_analysis';
    selectedWords?: string[];
    newsSummary?: string;
    sourceUrls?: string[];
    selectedRssItem?: any; // Keeping loose to avoid deep dependency on NewsItem
    draftText?: string;
    completedLevels?: any[]; // Keeping loose to avoid deep dependency on ArticleWithAnalysis
    usage?: Record<string, any>;
    selectedRssId?: number;
}

export type AnalysisRole =
    | 's' | 'v' | 'o' | 'io' | 'cmp'  // Core
    | 'rc' | 'pp' | 'adv' | 'app'     // Clauses & Phrases
    | 'pas' | 'con'                   // Voice & Connectives
    | 'inf' | 'ger' | 'ptc';          // Non-finite

export interface SentenceData {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface AnalysisAnnotation {
    start: number;
    end: number;
    role: AnalysisRole;
    text: string;
}

// Loose types for Highlights until frontend structure is confirmed
export interface HighlightMeta {
    [key: string]: any;
}

export interface HighlightStyle {
    color?: string;
    type?: 'underline' | 'background';
    [key: string]: any;
}
