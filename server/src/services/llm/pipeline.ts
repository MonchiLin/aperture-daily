/**
 * Pipeline - Orchestrates the 4-stage article generation
 */

import type { LLMClient } from './client';

import {
    runSearchAndSelection,
    runDraftGeneration,
    runJsonConversion,
    type PipelineConfig,
} from './stages';

import { runSentenceAnalysis, type ArticleWithAnalysis } from './analyzer';
import type { DailyNewsOutput } from '../../schemas/dailyNews';

// ============ Types ============

export interface PipelineCheckpoint {
    stage: 'search_selection' | 'draft' | 'conversion' | 'grammar_analysis';
    selectedWords?: string[];
    newsSummary?: string;
    sourceUrls?: string[];
    draftText?: string;
    completedLevels?: ArticleWithAnalysis[];
    usage?: Record<string, any>;
}

export interface PipelineArgs {
    client: LLMClient;
    config?: PipelineConfig;
    currentDate: string;
    topicPreference: string;
    candidateWords: string[];
    recentTitles?: string[];
    checkpoint?: PipelineCheckpoint | null;
    onCheckpoint?: (checkpoint: PipelineCheckpoint) => Promise<void>;
}

export interface PipelineResult {
    output: DailyNewsOutput;
    selectedWords: string[];
    usage: Record<string, any>;
}

// ============ Pipeline ============

export async function runPipeline(args: PipelineArgs): Promise<PipelineResult> {
    let selectedWords = args.checkpoint?.selectedWords || [];
    let newsSummary = args.checkpoint?.newsSummary || '';
    let sourceUrls = args.checkpoint?.sourceUrls || [];
    let draftText = args.checkpoint?.draftText || '';
    let usage: Record<string, any> = args.checkpoint?.usage || {};

    const currentStage = args.checkpoint?.stage || 'start';
    const config = args.config || {};

    // Stage 1: Search + Selection
    if (currentStage === 'start') {
        const res = await runSearchAndSelection({
            client: args.client,
            config,
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate,
            recentTitles: args.recentTitles
        });

        selectedWords = res.selectedWords;
        newsSummary = res.newsSummary;
        sourceUrls = res.sourceUrls;
        usage.search_selection = res.usage;

        console.log(`[Pipeline] Stage 1 Complete. Selected ${selectedWords.length} words.`);

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'search_selection',
                selectedWords,
                newsSummary,
                sourceUrls,
                usage
            });
        }
    }

    // Stage 2: Draft Generation
    if (currentStage === 'start' || currentStage === 'search_selection') {
        const res = await runDraftGeneration({
            client: args.client,
            config,
            selectedWords,
            newsSummary,
            sourceUrls,
            currentDate: args.currentDate,
            topicPreference: args.topicPreference
        });

        draftText = res.draftText;
        usage.draft = res.usage;

        console.log(`[Pipeline] Stage 2 Complete. Draft: ${draftText.length} chars.`);

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'draft',
                selectedWords,
                newsSummary,
                sourceUrls,
                draftText,
                usage
            });
        }
    }

    // Stage 3: JSON Conversion
    const generation = await runJsonConversion({
        client: args.client,
        config,
        draftText,
        sourceUrls,
        selectedWords
    });

    console.log(`[Pipeline] Stage 3 Complete. Title: ${generation.output.title}`);
    usage.conversion = generation.usage;

    if (args.onCheckpoint) {
        await args.onCheckpoint({
            stage: 'conversion',
            selectedWords,
            newsSummary,
            sourceUrls,
            draftText,
            usage
        });
    }

    // Stage 4: Sentence Analysis
    if (generation.output.articles && Array.isArray(generation.output.articles) && generation.output.articles.length > 0) {
        const completedFromCheckpoint = args.checkpoint?.completedLevels || [];

        console.log(`[Pipeline] Starting Stage 4 (Sentence Analysis)...`);

        // Create adapter for sentenceAnalyzer (ILLMClient interface)
        const clientAdapter = {
            generateContent: async (messages: Array<{ role: string; content: string }>, options: any) => {
                const response = await args.client.generate({
                    system: options?.system,
                    prompt: messages.map(m => m.content).join('\n'),
                });
                return {
                    text: response.text,
                    usage: response.usage ? {
                        inputTokens: response.usage.inputTokens ?? 0,
                        outputTokens: response.usage.outputTokens ?? 0,
                        totalTokens: response.usage.totalTokens ?? 0,
                    } : undefined
                };
            }
        };

        const analysisRes = await runSentenceAnalysis({
            client: clientAdapter as any,
            model: args.client.modelName,
            articles: generation.output.articles as any,
            completedLevels: completedFromCheckpoint as any,
            onLevelComplete: args.onCheckpoint ? async (completedArticles) => {
                await args.onCheckpoint!({
                    stage: 'grammar_analysis',
                    selectedWords,
                    newsSummary,
                    sourceUrls,
                    draftText,
                    completedLevels: completedArticles as any,
                    usage
                });
            } : undefined
        });

        generation.output.articles = analysisRes.articles as any;
        usage.sentence_analysis = analysisRes.usage;

        console.log(`[Pipeline] Stage 4 Complete.`);

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'grammar_analysis',
                selectedWords,
                newsSummary,
                sourceUrls,
                draftText,
                completedLevels: analysisRes.articles as any,
                usage
            });
        }
    }

    return {
        output: generation.output,
        selectedWords,
        usage
    };
}


