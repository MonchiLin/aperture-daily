import { z } from 'zod';
import type { DailyNewsOutput } from '../../schemas/dailyNews';
import { dailyNewsOutputSchema } from '../../schemas/dailyNews';
import { SOURCE_URL_LIMIT, WORD_SELECTION_MAX_WORDS, WORD_SELECTION_MIN_WORDS } from './llmLimits';
import {
    appendResponseToHistory,
    collectHttpUrlsFromUnknown,
    extractHttpUrlsFromText,
    normalizeDailyNewsOutput,
    normalizeWordSelectionPayload
} from './openaiHelpers';
import {
    WORD_SELECTION_SYSTEM_PROMPT,
    buildDraftGenerationUserPrompt,
    buildJsonConversionUserPrompt,
    buildResearchUserPrompt,
    buildWordSelectionUserPrompt
} from './openaiPrompts';

import { createOpenAiCompatibleClient, type OpenAiCompatibleEnv } from './client';

// xhigh medium low auto
const reasoningEffort = "xhigh"

// ============================================
// 候选词类型
// ============================================

export type CandidateWord = {
    word: string;
    type: 'new' | 'review';
};

// ============================================
// 选词 schema
// ============================================

const wordSelectionSchema = z.object({
    selected_words: z.array(z.string()).min(WORD_SELECTION_MIN_WORDS).max(WORD_SELECTION_MAX_WORDS),
    selection_reasoning: z.string().optional()
});

type OpenAiClient = ReturnType<typeof createOpenAiCompatibleClient>;
type ConversationHistory = any[];

async function runWordSelection(args: {
    client: OpenAiClient;
    history: ConversationHistory;
    model: string;
    candidateWords: CandidateWord[];
    topicPreference: string;
    currentDate: string;
}) {
    console.log('[LLM Stage 1/4] Word Selection - START', { candidateCount: args.candidateWords.length, model: args.model });
    const stageStart = Date.now();

    const candidateWordsJson = JSON.stringify(args.candidateWords, null, 2);

    args.history.push({
        role: 'system',
        content: WORD_SELECTION_SYSTEM_PROMPT
    });
    args.history.push({
        role: 'user',
        content: buildWordSelectionUserPrompt({
            candidateWordsJson,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate
        })
    });

    console.log('[LLM Stage 1/4] Sending API request...');
    const wordSelectionResp = await args.client.responses.create({
        model: args.model,
        stream: false,
        reasoning: {
            effort: reasoningEffort,
            summary: "detailed"
        },
        text: { format: { type: 'json_object' } },
        input: args.history
    });
    console.log('[LLM Stage 1/4] API response received in', Date.now() - stageStart, 'ms');

    console.log('[Word Selection] API Response keys:', Object.keys(wordSelectionResp));
    console.log('[Word Selection] output_text:', wordSelectionResp.output_text);

    const wordSelectionText = wordSelectionResp.output_text?.trim();
    if (!wordSelectionText) throw new Error('LLM returned empty word selection');

    let rawParsed: unknown;
    try {
        rawParsed = JSON.parse(wordSelectionText);
    } catch (e) {
        throw new Error(`Failed to parse word selection JSON: ${e}\nRaw: ${wordSelectionText.slice(0, 500)}`);
    }
    rawParsed = normalizeWordSelectionPayload(rawParsed);

    const wordSelectionParsed = wordSelectionSchema.safeParse(rawParsed);
    if (!wordSelectionParsed.success) {
        throw new Error(`Invalid word selection JSON: ${wordSelectionParsed.error.message}\nRaw: ${wordSelectionText.slice(0, 500)}`);
    }

    const selectedWords = wordSelectionParsed.data.selected_words;
    console.log('[Word Selection] Extracted words:', selectedWords);

    const history = appendResponseToHistory(args.history, wordSelectionResp);
    return {
        history,
        selectedWords,
        usage: wordSelectionResp.usage ?? null
    };
}

async function runResearch(args: {
    client: OpenAiClient;
    history: ConversationHistory;
    model: string;
    selectedWords: string[];
    topicPreference: string;
    currentDate: string;
}) {
    console.log('[LLM Stage 2/4] Research - START', { selectedWords: args.selectedWords });
    const stageStart = Date.now();

    args.history.push({
        role: 'user',
        content: buildResearchUserPrompt({
            selectedWords: args.selectedWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate
        })
    });

    console.log('[LLM Stage 2/4] Sending web_search API request...');
    const researchResp = await args.client.responses.create({
        model: args.model,
        stream: false,
        reasoning: {
            effort: reasoningEffort,
            summary: "detailed"
        },
        tools: [
            {
                type: 'web_search',
                user_location: { type: 'approximate', timezone: 'Asia/Shanghai' }
            }
        ],
        tool_choice: 'auto',
        input: args.history,
        include: ['web_search_call.results', 'web_search_call.action.sources']
    });
    console.log('[LLM Stage 2/4] API response received in', Date.now() - stageStart, 'ms');

    const researchText = researchResp.output_text?.trim() ?? '';
    if (!researchText) throw new Error('LLM returned empty research content');

    const sourceUrls = Array.from(
        new Set([
            ...extractHttpUrlsFromText(researchText),
            ...collectHttpUrlsFromUnknown(researchResp)
        ])
    ).slice(0, SOURCE_URL_LIMIT);

    if (sourceUrls.length === 0) throw new Error('LLM research produced no source URLs');

    const history = appendResponseToHistory(args.history, researchResp);
    return {
        history,
        sourceUrls,
        usage: researchResp.usage ?? null
    };
}

async function runDraftGeneration(args: {
    client: OpenAiClient;
    history: ConversationHistory;
    model: string;
    selectedWords: string[];
    sourceUrls: string[];
    currentDate: string;
    topicPreference: string;
}) {
    console.log('[LLM Stage 3/4] Draft Generation - START', { sourceUrlCount: args.sourceUrls.length });
    const stageStart = Date.now();

    args.history.push({
        role: 'user',
        content: buildDraftGenerationUserPrompt({
            selectedWords: args.selectedWords,
            sourceUrls: args.sourceUrls,
            currentDate: args.currentDate,
            topicPreference: args.topicPreference
        })
    });

    console.log('[LLM Stage 3/4] Sending API request...');
    const draftResp = await args.client.responses.create({
        model: args.model,
        stream: false,
        reasoning: { effort: reasoningEffort },
        input: args.history
    });
    console.log('[LLM Stage 3/4] API response received in', Date.now() - stageStart, 'ms');

    const draftText = draftResp.output_text?.trim();
    if (!draftText) throw new Error('LLM returned empty draft content');

    const history = appendResponseToHistory(args.history, draftResp);
    return {
        history,
        draftText,
        usage: draftResp.usage ?? null
    };
}

async function runJsonConversion(args: {
    client: OpenAiClient;
    history: ConversationHistory;
    model: string;
    draftText: string;
    sourceUrls: string[];
    selectedWords: string[];
}) {
    console.log('[LLM Stage 4/4] JSON Conversion - START', { draftLength: args.draftText.length });
    const stageStart = Date.now();

    args.history.push({
        role: 'user',
        content: buildJsonConversionUserPrompt({
            draftText: args.draftText,
            sourceUrls: args.sourceUrls,
            selectedWords: args.selectedWords
        })
    });

    console.log('[LLM Stage 4/4] Sending API request...');
    const genResp = await args.client.responses.create({
        model: args.model,
        stream: false,
        reasoning: { effort: reasoningEffort },
        text: { format: { type: 'json_object' } },
        input: args.history
    });
    console.log('[LLM Stage 4/4] API response received in', Date.now() - stageStart, 'ms');

    const content = genResp.output_text;
    if (!content) throw new Error('LLM returned empty content');

    const parsed: unknown = JSON.parse(content);

    const first = dailyNewsOutputSchema.safeParse(parsed);
    if (!first.success) {
        throw new Error(`Invalid LLM JSON output: ${first.error.message}`);
    }
    const history = appendResponseToHistory(args.history, genResp);
    return {
        history,
        output: first.data,
        usage: genResp.usage ?? null
    };
}

// ============================================
// 多轮生成主流程
// ============================================

export type GenerationCheckpoint = {
    stage: 'word_selection' | 'research' | 'draft' | 'conversion';
    history: ConversationHistory;
    selectedWords?: string[];
    sourceUrls?: string[];
    draftText?: string;
    usage?: Record<string, any>;
};

export async function generateDailyNewsWithWordSelection(args: {
    env: OpenAiCompatibleEnv;
    model: string;
    currentDate: string;
    topicPreference: string;
    candidateWords: CandidateWord[];
    checkpoint?: GenerationCheckpoint | null;
    onCheckpoint?: (checkpoint: GenerationCheckpoint) => Promise<void>;
}): Promise<{ output: DailyNewsOutput; selectedWords: string[]; usage: unknown }> {
    const client = createOpenAiCompatibleClient(args.env);

    let history: ConversationHistory = args.checkpoint?.history || [];
    let selectedWords = args.checkpoint?.selectedWords || [];
    let sourceUrls = args.checkpoint?.sourceUrls || [];
    let draftText = args.checkpoint?.draftText || '';
    let usage: any = args.checkpoint?.usage || {};

    const currentStage = args.checkpoint?.stage || 'start';

    // Stage 1: Word Selection
    if (currentStage === 'start') {
        const res = await runWordSelection({
            client,
            history,
            model: args.model,
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate
        });
        history = res.history;
        selectedWords = res.selectedWords;
        usage.word_selection = res.usage;

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'word_selection',
                history,
                selectedWords,
                usage
            });
        }
    }

    // Stage 2: Research
    if (currentStage === 'start' || currentStage === 'word_selection') {
        const res = await runResearch({
            client,
            history,
            model: args.model,
            selectedWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate
        });
        history = res.history;
        sourceUrls = res.sourceUrls;
        usage.research = res.usage;

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'research',
                history,
                selectedWords,
                sourceUrls,
                usage
            });
        }
    }

    // Stage 3: Draft Generation
    if (currentStage === 'start' || currentStage === 'word_selection' || currentStage === 'research') {
        const res = await runDraftGeneration({
            client,
            history,
            model: args.model,
            selectedWords,
            sourceUrls,
            currentDate: args.currentDate,
            topicPreference: args.topicPreference
        });
        history = res.history;
        draftText = res.draftText;
        usage.draft = res.usage;

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'draft',
                history,
                selectedWords,
                sourceUrls,
                draftText: res.draftText,
                usage
            });
        }
    }

    // Stage 4: Conversion
    const generation = await runJsonConversion({
        client,
        history,
        model: args.model,
        draftText: typeof draftText === 'string' ? draftText : '',
        sourceUrls,
        selectedWords
    });

    return {
        output: normalizeDailyNewsOutput(generation.output),
        selectedWords,
        usage: {
            ...usage,
            generation: generation.usage ?? null
        }
    };
}
