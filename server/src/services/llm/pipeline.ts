/**
 * LLM 生成流水线 (LLM Generation Pipeline)
 * 
 * 核心架构模式：Pipeline Pattern + Checkpointing
 * 
 * 该模块将复杂的长文本生成任务拆分为 4 个离散的、顺序执行的阶段 (Stage)。
 * 每个阶段都是无状态的，但可以通过 `PipelineCheckpoint` 对象传递上下文。
 * 
 * 关键特性：
 * 1. 容错性 (Fault Tolerance): 支持在任意阶段保存中间状态。如果任务失败或进程崩溃，
 *    可以从最近的 Checkpoint 恢复，而无需重头开始。这对耗时 2-5 分钟的 LLM 任务至关重要。
 * 2. 模块化 (Modularity): 每个阶段的 Prompt 和逻辑是隔离的，便于独立优化和测试。
 * 3. 可观察性 (Observability): 每个阶段都有明确的输入输出和 Token 消耗记录。
 */

import type { LLMClient } from './client';
import type { DailyNewsOutput } from '../../schemas/dailyNews';
import { type ArticleWithAnalysis } from './analyzer';
import type { PipelineConfig, Topic, NewsItem } from './types'; // [Fixed Import]
import { NewsFetcher } from '../news/fetcher';

// ============ 类型定义 ============

export interface PipelineCheckpoint {
    stage: 'search_selection' | 'draft' | 'conversion' | 'grammar_analysis';
    selectedWords?: string[];
    newsSummary?: string;
    sourceUrls?: string[];
    selectedRssItem?: NewsItem; // [NEW]
    draftText?: string;
    completedLevels?: ArticleWithAnalysis[];
    usage?: Record<string, any>;
    selectedRssId?: number; // [NEW]
}

// PipelineArgs interface update
export interface PipelineArgs {
    client: LLMClient;
    config?: PipelineConfig;
    currentDate: string;
    topicPreference: string;
    topics?: Topic[]; // [NEW]
    candidateWords: string[];
    recentTitles?: string[];
    checkpoint?: PipelineCheckpoint | null;
    onCheckpoint?: (checkpoint: PipelineCheckpoint) => Promise<void>;
    excludeRssLinks?: string[]; // [NEW]
}

// ... inside runPipeline ...

export interface PipelineResult {
    output: DailyNewsOutput;
    selectedWords: string[];
    usage: Record<string, any>;
    selectedRssId?: number;
    selectedRssItem?: NewsItem; // [NEW]
}

// ============ 流水线核心逻辑 (Pipeline Core) ============

/**
 * 执行完整的文章生成流水线
 * 
 * @param args 配置参数，包含 LLM 客户端、运行时配置和恢复用的 Checkpoint
 * @returns 最终生成的文章数据、元数据和 Token 消耗统计
 */
export async function runPipeline(args: PipelineArgs): Promise<PipelineResult> {
    let selectedWords = args.checkpoint?.selectedWords || [];
    let newsSummary = args.checkpoint?.newsSummary || '';
    let sourceUrls = args.checkpoint?.sourceUrls || [];
    let selectedRssItem = args.checkpoint?.selectedRssItem; // [NEW]
    let draftText = args.checkpoint?.draftText || '';
    let usage: Record<string, any> = args.checkpoint?.usage || {};
    let selectedRssId = args.checkpoint?.selectedRssId; // [NEW]

    // 初始化上下文：优先从 Checkpoint 恢复，否则使用空默认值
    // 这种模式允许函数既能处理“全新开始”的任务，也能处理“中途恢复”的任务
    const currentStage = args.checkpoint?.stage || 'start';
    const config = args.config || {};



    // [Stage 1] 搜索与选题 (Search & Selection)
    // 目标：从 LLM 的知识库或实时网络搜索中获取新闻素材，并选定本文的教学词汇。
    // 该阶段对应“编辑”的角色，决定写什么，用什么词。
    if (currentStage === 'start') {
        // [NEW] 尝试获取 RSS 新闻推荐
        let newsCandidates: NewsItem[] = [];
        try {
            const fetcher = new NewsFetcher();
            // 提取 Topic IDs 用于过滤 (假设 Topic 对象有 id 字段)
            const topicIds = args.topics?.map(t => t.id) || [];
            newsCandidates = await fetcher.fetchAggregate(topicIds, args.currentDate, args.excludeRssLinks);
            // console.log(`[Pipeline] Fetched ${newsCandidates.length} news candidates via RSS.`);
        } catch (error) {
            console.warn(`[Pipeline] Failed to fetch RSS news (falling back to pure search):`, error);
            // 不阻断流程，仅记录警告
        }

        const res = await args.client.runStage1_SearchAndSelection({
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate,
            recentTitles: args.recentTitles,
            topics: args.topics,
            newsCandidates, // [NEW] 注入推荐新闻
            config // Pass pipeline config if needed for tools override
        });

        selectedWords = res.selectedWords;
        newsSummary = res.newsSummary;
        newsSummary = res.newsSummary;
        sourceUrls = res.sourceUrls;
        selectedRssId = res.selectedRssId;
        selectedRssItem = res.selectedRssItem; // [NEW]
        usage.search_selection = res.usage;

        console.log(`[Pipeline] Stage 1 Complete. Selected ${selectedWords.length} words.`);

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'search_selection',
                selectedWords,
                newsSummary,
                sourceUrls,
                selectedRssId,
                usage
            });
        }
    }

    // [Stage 2] 草稿生成 (Draft Generation)
    // 目标：基于 Stage 1 的素材和词汇，撰写一篇连贯的、符合难度要求的英文新闻草稿。
    // 该阶段对应“作家”的角色，专注于内容创作，暂不关心 JSON 结构化。
    // 输入：Selected Words, News Summary, Source URLs
    // 输出：纯文本草稿 (Draft Text)
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

    // [Stage 3] 结构化转换 (JSON Conversion)
    // 目标：将纯文本草稿转化为富文本 JSON 结构 (包含标题、难度分级、定义等)。
    // 该阶段对应“排版”的角色。LLM 在此阶段不仅要格式化，还要根据内容重写出 3 个不同难度 (Level 1-3) 的版本。
    // 注意：目前 Stage 3 紧接在 Stage 2 后执行，通常不进行中间 Checkpoint 保存，除非 Stage 2 非常耗时。

    // 如果需要在此处添加 Checkpoint，可以增加 if 判断，但目前的逻辑是直接执行。

    const generation = await args.client.runStage3_JsonConversion({
        draftText,
        sourceUrls,
        selectedWords,
        topicPreference: args.topicPreference,
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

    // [Stage 4] 句法分析 (Sentence Analysis)
    // 目标：对生成的文章进行语言学分析 (Subject/Verb/Object 标注)。
    // 核心难点：句法分析非常消耗 Token 且容易超时。
    // 解决方案：
    // 1. 批处理：将文章按 Level 分开处理。
    // 2. 增量 Checkpoint：利用 analyzer.ts 内部的 onLevelComplete 回调，每分析完一个 Level 就保存一次数据库。
    //    这样如果 Level 3 分析超时，重试时只需分析 Level 3，跳过 Level 1/2。
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
        selectedRssId,
        selectedRssItem,
        usage
    };
}


