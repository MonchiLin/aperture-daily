/**
 * Gemini 三阶段生成主流程
 * 
 * 三阶段 CoT 文章生成入口（使用 Gemini REST API）
 */

import type { DailyNewsOutput } from '../../schemas/dailyNews';
import { createGeminiClient, type GeminiEnv } from './geminiClient';
import type { GeminiCheckpoint3 } from './types';
import {
    runGeminiSearchAndSelection,
    runGeminiDraftGeneration,
    runGeminiJsonConversion,
} from './geminiStages3';
import { runSentenceAnalysis } from './sentenceAnalyzer';
import type { GeminiResponse } from './geminiClient';

interface UsageRecord {
    [key: string]: GeminiResponse['usageMetadata'] | null | UsageRecord;
}

export async function generateDailyNews3StageWithGemini(args: {
    env: GeminiEnv;
    model: string;
    currentDate: string;
    topicPreference: string;
    candidateWords: string[];
    recentTitles?: string[];
    checkpoint?: GeminiCheckpoint3 | null;
    onCheckpoint?: (checkpoint: GeminiCheckpoint3) => Promise<void>;
}): Promise<{ output: DailyNewsOutput; selectedWords: string[]; usage: unknown, structure: unknown[] }> {
    const client = createGeminiClient(args.env);

    let selectedWords = args.checkpoint?.selectedWords || [];
    let newsSummary = args.checkpoint?.newsSummary || '';
    let sourceUrls = args.checkpoint?.sourceUrls || [];
    let draftText = args.checkpoint?.draftText || '';
    let usage: UsageRecord = (args.checkpoint?.usage as UsageRecord) || {};

    const currentStage = args.checkpoint?.stage || 'start';

    // Stage 1: Search + Selection
    if (currentStage === 'start') {
        const res = await runGeminiSearchAndSelection({
            client,
            history: [],
            model: args.model,
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate,
            recentTitles: args.recentTitles
        });

        selectedWords = res.selectedWords;
        newsSummary = res.newsSummary;
        sourceUrls = res.sourceUrls;
        usage.search_selection = res.usage;

        console.log(`[Pipeline 4-Stage] Stage 1 (Search+Selection) Complete. Selected ${selectedWords.length} words.`);

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
        const res = await runGeminiDraftGeneration({
            client,
            model: args.model,
            selectedWords,
            newsSummary,
            sourceUrls,
            currentDate: args.currentDate,
            topicPreference: args.topicPreference
        });

        draftText = res.draftText;
        usage.draft = res.usage;

        console.log(`[Pipeline 4-Stage] Stage 2 (Draft) Complete. Characters: ${draftText.length}`);

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

    // Stage 3: Conversion (JSON Generation)
    // Note: We might want to checkpoint this too, but for now we proceed.
    const generation = await runGeminiJsonConversion({
        client,
        model: args.model,
        draftText: typeof draftText === 'string' ? draftText : '',
        sourceUrls,
        selectedWords
    });

    console.log(`[Pipeline 4-Stage] Stage 3 (Conversion) Complete. Title: ${generation.output.title}`);
    usage.conversion = generation.usage as UsageRecord['conversion'];

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

    // Stage 4: Sentence Analysis (with Checkpoint Support)
    // Supports resume from completedLevels and saves progress per-level
    if (generation.output.articles && Array.isArray(generation.output.articles) && generation.output.articles.length > 0) {
        const completedFromCheckpoint = args.checkpoint?.completedLevels || [];

        console.log(`[Pipeline 4-Stage] Starting Stage 4 (Sentence Analysis) for ${generation.output.articles.length} levels...`);
        if (completedFromCheckpoint.length > 0) {
            console.log(`[Pipeline 4-Stage] Resuming with ${completedFromCheckpoint.length} completed levels from checkpoint`);
        }

        const analysisRes = await runSentenceAnalysis({
            client,
            model: args.model,
            articles: generation.output.articles as Parameters<typeof runSentenceAnalysis>[0]['articles'],
            completedLevels: completedFromCheckpoint as Parameters<typeof runSentenceAnalysis>[0]['completedLevels'],
            onLevelComplete: args.onCheckpoint ? async (completedArticles) => {
                // Save checkpoint after each level completes
                await args.onCheckpoint!({
                    stage: 'grammar_analysis',
                    selectedWords,
                    newsSummary,
                    sourceUrls,
                    draftText,
                    completedLevels: completedArticles,
                    usage
                });
            } : undefined
        });

        // In-place update of articles with sentences and structure
        generation.output.articles = analysisRes.articles as typeof generation.output.articles;
        usage.sentence_analysis = analysisRes.usage;

        console.log(`[Pipeline 4-Stage] Stage 4 Complete.`);

        // Final checkpoint after all levels done
        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'grammar_analysis',
                selectedWords,
                newsSummary,
                sourceUrls,
                draftText,
                completedLevels: analysisRes.articles,
                usage
            });
        }
    }

    return {
        output: generation.output,
        selectedWords,
        structure: [], // No longer used as separate return
        usage
    };
}
