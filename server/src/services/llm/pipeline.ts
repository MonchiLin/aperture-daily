/**
 * Pipeline - Orchestrates the 4-stage article generation
 */

import type { LLMClient } from './client';
import type { DailyNewsOutput } from '../../schemas/dailyNews';
import { type ArticleWithAnalysis } from './analyzer';
import type { PipelineConfig } from './types';

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
        const res = await args.client.runStage1_SearchAndSelection({
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate,
            recentTitles: args.recentTitles,
            config // Pass pipeline config if needed for tools override
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
        const res = await args.client.runStage2_DraftGeneration({
            selectedWords,
            newsSummary,
            sourceUrls,
            currentDate: args.currentDate,
            topicPreference: args.topicPreference,
            config
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
    // Note: Stage 3 usually happens after draft, but pipeline logic flows through. 
    // If we wanted checkpointing here we'd add another if block, but existing logic runs it immediately.

    const generation = await args.client.runStage3_JsonConversion({
        draftText,
        sourceUrls,
        selectedWords,
        config
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

        const analysisRes = await args.client.runStage4_SentenceAnalysis({
            articles: generation.output.articles,
            completedLevels: completedFromCheckpoint,
            config,
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


