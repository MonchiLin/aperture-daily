/**
 * LLM 模块共享类型
 */

import { z } from 'zod';
import { createOpenAiCompatibleClient } from './client';
import { WORD_SELECTION_MAX_WORDS, WORD_SELECTION_MIN_WORDS } from './limits';

// 候选词类型
export type CandidateWord = {
    word: string;
    type: 'new' | 'review';
};

// 客户端和对话类型
export type OpenAiClient = ReturnType<typeof createOpenAiCompatibleClient>;
export type ConversationHistory = any[];

// 选词 Schema
export const wordSelectionSchema = z.object({
    selected_words: z.array(z.string()).min(WORD_SELECTION_MIN_WORDS).max(WORD_SELECTION_MAX_WORDS),
    selection_reasoning: z.string().optional()
});

// Checkpoint 类型 (Gemini 旧版)
export const geminiHistorySchema = z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({
        text: z.string()
    }))
}));

export const geminiCheckpointSchema = z.object({
    stage: z.enum(['word_selection', 'research', 'draft', 'conversion']),
    history: geminiHistorySchema,
    selectedWords: z.array(z.string()).optional(),
    sourceUrls: z.array(z.string()).optional(),
    draftText: z.string().optional(),
    usage: z.record(z.string(), z.any()).optional()
});

export type GeminiCheckpoint = z.infer<typeof geminiCheckpointSchema>;

// Checkpoint 类型 (Gemini 3-Stage)
export type GeminiCheckpoint3 = {
    stage: 'search_selection' | 'draft' | 'conversion' | 'grammar_analysis';
    selectedWords?: string[];
    newsSummary?: string;
    sourceUrls?: string[];
    draftText?: string;
    structure?: GeminiStructureData;
    /** Stage 4 checkpoint: 已完成分析的 article levels */
    completedLevels?: Array<{
        level: 1 | 2 | 3;
        content: string;
        level_name: string;
        difficulty_desc: string;
        title?: string;
        sentences: Array<{ id: number; start: number; end: number; text: string }>;
        structure: Array<{ start: number; end: number; role: string; text: string }>;
    }>;
    usage?: Record<string, any>;
};

// Structure Data (Standoff Markup) - Final output format
// 14 roles for comprehensive grammar analysis
export type StructureRole =
    | 's'    // Subject - 主语
    | 'v'    // Verb - 谓语动词 (complete verb phrase)
    | 'o'    // Direct Object - 直接宾语
    | 'io'   // Indirect Object - 间接宾语
    | 'cmp'  // Complement - 补语
    | 'rc'   // Relative Clause - 定语从句
    | 'pp'   // Prepositional Phrase - 介词短语
    | 'adv'  // Adverbial - 状语
    | 'app'  // Appositive - 同位语
    | 'pas'  // Passive Voice - 被动语态
    | 'con'  // Connective - 连接词
    | 'inf'  // Infinitive - 不定式
    | 'ger'  // Gerund - 动名词
    | 'ptc'; // Participle - 分词

export type GeminiStructureData = Array<{
    start: number;
    end: number;
    role: StructureRole;
    extract?: string;
}>;

// Structure Response (LLM word-index output) - Intermediate format
export type GeminiStructureResponse = Array<{
    words: [number] | [number, number];  // [singleIdx] or [startIdx, endIdx]
    role: StructureRole;
}>;
