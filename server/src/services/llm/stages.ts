/**
 * Stages - 4-Stage Article Generation Pipeline
 * 
 * Stage 1: Search + Selection (Google Search Grounding + Thinking)
 * Stage 2: Draft Generation (Thinking mode)
 * Stage 3: JSON Conversion (Zod structured output)
 * Stage 4: Sentence Analysis (batch grammar analysis)
 */

import { z } from 'zod';
import type { LLMClient } from './client';

import { dailyNewsOutputSchema, type DailyNewsOutput } from '../../schemas/dailyNews';
import { SOURCE_URL_LIMIT } from './utils';
import {
    extractHttpUrlsFromText,
    normalizeDailyNewsOutput,
    resolveRedirectUrls,
    extractJson
} from './utils';
import {
    SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
    DRAFT_SYSTEM_INSTRUCTION,
    JSON_SYSTEM_INSTRUCTION,
    buildSearchAndSelectionUserPrompt,
    buildDraftGenerationUserPrompt,
    buildJsonConversionUserPrompt
} from './prompts';

// ============ Types ============

export interface PipelineConfig {
    thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface StageUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
}

// Search + Selection Output Schema (Stage 1)
const SearchSelectionSchema = z.object({
    selected_words: z.array(z.string()).min(1, 'At least one word must be selected'),
    news_summary: z.string().min(10, 'News summary too short'),
    source: z.string().optional(),
    sources: z.array(z.string()).optional(),
});

// Draft Output Schema (Stage 2)
const DraftOutputSchema = z.object({
    draftText: z.string().min(100, 'Draft text too short (min 100 chars)')
});

// ============ Stage 1: Search + Selection ============

export async function runSearchAndSelection(args: {
    client: LLMClient;
    config: PipelineConfig;
    candidateWords: string[];
    topicPreference: string;
    currentDate: string;
    recentTitles?: string[];
}) {
    console.log('[Stage 1/4] Search + Selection - START', {
        candidateCount: args.candidateWords.length,
        model: args.client.modelName
    });
    const stageStart = Date.now();

    const userPrompt = buildSearchAndSelectionUserPrompt({
        candidateWords: args.candidateWords,
        topicPreference: args.topicPreference,
        currentDate: args.currentDate,
        recentTitles: args.recentTitles
    });

    const response = await args.client.generate({
        system: SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
        prompt: userPrompt,
        config: {
            googleSearchRetrieval: true,
            // Enable OpenAI Native Web Search (handled by LLMClient bypass)
            tools: [{ type: 'web_search' }],
            thinkingConfig: {
                thinkingLevel: args.config.thinkingLevel || 'HIGH',
            },
        },
    });

    console.log('[Stage 1/4] API response received in', Date.now() - stageStart, 'ms');

    const responseText = extractJson(response.text);
    console.log('[Search+Selection] output_text (first 500 chars):', responseText.slice(0, 500));

    if (!responseText) throw new Error('LLM returned empty search+selection response');

    // Zod validation for Stage 1 output
    const parseResult = SearchSelectionSchema.safeParse(JSON.parse(responseText));
    if (!parseResult.success) {
        console.error('[Search+Selection] Zod Validation Error:', parseResult.error.issues);
        throw new Error(`Stage 1 validation failed: ${parseResult.error.message}`);
    }

    const parsed = parseResult.data;
    const selectedWords = parsed.selected_words.filter(w => typeof w === 'string');
    const newsSummary = parsed.news_summary || '';

    let rawSources: string[] = [];
    if (parsed.source) rawSources = [parsed.source];
    else if (parsed.sources) rawSources = parsed.sources.filter(s => typeof s === 'string');

    if (selectedWords.length === 0) throw new Error('No words selected from candidates');
    if (!newsSummary) throw new Error('No news summary provided');

    // Collect URLs
    const allUrls = Array.from(new Set([
        ...rawSources,
        ...extractHttpUrlsFromText(newsSummary),
        ...extractHttpUrlsFromText(response.text)
    ])).slice(0, SOURCE_URL_LIMIT);

    const sourceUrls = await resolveRedirectUrls(allUrls);

    console.log('[Search+Selection] Selected words:', selectedWords);
    console.log('[Search+Selection] Resolved', sourceUrls.length, 'source URL(s)');

    return {
        selectedWords,
        newsSummary,
        sourceUrls,
        usage: response.usage ?? null
    };
}

// ============ Stage 2: Draft Generation ============

export async function runDraftGeneration(args: {
    client: LLMClient;
    config: PipelineConfig;
    selectedWords: string[];
    newsSummary: string;
    sourceUrls: string[];
    currentDate: string;
    topicPreference: string;
}) {
    console.log('[Stage 2/4] Draft Generation - START', {
        wordCount: args.selectedWords.length,
        sourceUrlCount: args.sourceUrls.length
    });
    const stageStart = Date.now();

    const userPrompt = buildDraftGenerationUserPrompt({
        selectedWords: args.selectedWords,
        newsSummary: args.newsSummary,
        sourceUrls: args.sourceUrls,
        currentDate: args.currentDate,
        topicPreference: args.topicPreference
    });

    const response = await args.client.generate({
        system: DRAFT_SYSTEM_INSTRUCTION,
        prompt: userPrompt,
        config: {
            thinkingConfig: {
                thinkingLevel: args.config.thinkingLevel || 'HIGH',
            },
        },
    });

    console.log('[Stage 2/4] API response received in', Date.now() - stageStart, 'ms');

    const draftText = response.text.trim();

    // Zod validation for Stage 2 output
    const validateResult = DraftOutputSchema.safeParse({ draftText });
    if (!validateResult.success) {
        console.error('[Draft] Zod Validation Error:', validateResult.error.issues);
        throw new Error(`Stage 2 validation failed: ${validateResult.error.message}`);
    }

    console.log('[Draft] Generated', draftText.length, 'characters');

    return {
        draftText,
        usage: response.usage ?? null
    };
}

// ============ Stage 3: JSON Conversion ============

export async function runJsonConversion(args: {
    client: LLMClient;
    config: PipelineConfig;
    draftText: string;
    sourceUrls: string[];
    selectedWords: string[];
}): Promise<{ output: DailyNewsOutput; usage: unknown }> {
    console.log('[Stage 3/4] JSON Conversion - START', { draftLength: args.draftText.length });
    const stageStart = Date.now();

    const userPrompt = buildJsonConversionUserPrompt({
        draftText: args.draftText,
        sourceUrls: args.sourceUrls,
        selectedWords: args.selectedWords
    });

    const response = await args.client.generate({
        system: JSON_SYSTEM_INSTRUCTION,
        prompt: userPrompt,
    });

    console.log('[Stage 3/4] API response received in', Date.now() - stageStart, 'ms');

    const content = extractJson(response.text);
    if (!content) throw new Error('LLM returned empty content');

    const parsed: unknown = JSON.parse(content);
    const result = dailyNewsOutputSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(`Invalid LLM JSON output: ${result.error.message}`);
    }

    return {
        output: normalizeDailyNewsOutput(result.data),
        usage: response.usage ?? null
    };
}

// ============ Stage 4: Sentence Analysis ============
// (Re-exported from analyzer.ts)

export { runSentenceAnalysis } from './analyzer';
