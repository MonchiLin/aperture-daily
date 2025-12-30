/**
 * Gemini 三阶段生成主流程
 * 
 * 三阶段 CoT 文章生成入口（使用 Gemini REST API）
 */

import type { DailyNewsOutput } from '../../schemas/dailyNews';
import { createGeminiClient, type GeminiEnv } from './geminiClient';
import {
    runGeminiSearchAndSelection,
    runGeminiDraftGeneration,
    runGeminiJsonConversion,
    type GeminiHistory
} from './geminiStages3';

// Gemini Checkpoint 类型（三阶段版）
export type GeminiCheckpoint3 = {
    stage: 'search_selection' | 'draft' | 'conversion';
    selectedWords?: string[];
    newsSummary?: string;
    sourceUrls?: string[];
    draftText?: string;
    usage?: Record<string, any>;
};

export async function generateDailyNews3StageWithGemini(args: {
    env: GeminiEnv;
    model: string;
    currentDate: string;
    topicPreference: string;
    candidateWords: string[];
    checkpoint?: GeminiCheckpoint3 | null;
    onCheckpoint?: (checkpoint: GeminiCheckpoint3) => Promise<void>;
}): Promise<{ output: DailyNewsOutput; selectedWords: string[]; usage: unknown }> {
    const client = createGeminiClient(args.env);

    let selectedWords = args.checkpoint?.selectedWords || [];
    let newsSummary = args.checkpoint?.newsSummary || '';
    let sourceUrls = args.checkpoint?.sourceUrls || [];
    let draftText = args.checkpoint?.draftText || '';
    let usage: any = args.checkpoint?.usage || {};

    const currentStage = args.checkpoint?.stage || 'start';

    // Stage 1: Search + Selection
    if (currentStage === 'start') {
        const history: GeminiHistory = [];

        const res = await runGeminiSearchAndSelection({
            client,
            history,
            model: args.model,
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate
        });

        selectedWords = res.selectedWords;
        newsSummary = res.newsSummary;
        sourceUrls = res.sourceUrls;
        usage.search_selection = res.usage;

        console.log(`[Pipeline 3-Stage] Stage 1 (Search+Selection) Complete. Selected ${selectedWords.length} words: ${JSON.stringify(selectedWords)}`);
        console.log(`[Pipeline 3-Stage] Found ${sourceUrls.length} source URLs`);

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

        console.log(`[Pipeline 3-Stage] Stage 2 (Draft) Complete. Generated ${draftText.length} characters.`);

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

    // Stage 3: Conversion
    const generation = await runGeminiJsonConversion({
        client,
        model: args.model,
        draftText: typeof draftText === 'string' ? draftText : '',
        sourceUrls,
        selectedWords
    });

    console.log(`[Pipeline 3-Stage] Stage 3 (Conversion) Complete. Final Output: ${generation.output.title}`);

    return {
        output: generation.output,
        selectedWords,
        usage: {
            ...usage,
            conversion: generation.usage ?? null
        }
    };
}
