/**
 * [LLM 生成流水线 (pipeline.ts)]
 * ------------------------------------------------------------------
 * 功能：将非结构化的 AI 生成过程拆解为 4 个原子阶段 (FSM)，实现状态管理。
 *
 * 核心流程 (Stages)：
 * 1. Search & Selection: 决定"写什么" (结合 RSS/Lexicon/Topic)。
 * 2. Draft Generation: 决定"怎么写" (输出纯文本，隔离 JSON 格式风险)。
 * 3. JSON Conversion: 确定性格式化 (Text -> JSON)。
 * 4. Syntax Analysis: 句法分析 (最耗时步骤，支持增量 Checkpoint)。
 *
 * 设计权衡 (Trade-off):
 * - Separation of Concerns: 拒绝 "One Prompt to Rule Them All"。
 *   将 "创意写作" (Stage 2) 与 "格式遵循" (Stage 3) 分离，不仅提升了文笔质量，也降低了 JSON 解析报错率。
 */

import type { LLMClient } from './client';
import type { DailyNewsOutput } from '../../schemas/dailyNews';
import { type ArticleWithAnalysis } from './analyzer';
import type { PipelineConfig, Topic, NewsItem } from './types'; // [Fixed Import]
import { NewsFetcher } from '../news/fetcher';
import { getStrategy, type GenerationMode } from './promptStrategies';

// ============ 类型定义 ============

export interface PipelineCheckpoint {
    /**
     * [FSM State] 当前流水线所处的"完成态" (Completed State).
     * 
     * Definition:
     * - 'start': 初始状态 (什么都没做)
     * - 'search_selection': 已完成选题，准备进入架构规划
     * - 'blueprint': 已完成架构图纸，准备进入撰写
     * - 'writer': 已完成草稿，准备进入格式化
     * - 'conversion': 已完成 JSON 转换，准备进入句法分析
     * - 'grammar_analysis': 已完成句法分析 (最终态)
     */
    stage: 'search_selection' | 'blueprint' | 'writer' | 'conversion' | 'grammar_analysis';
    selectedWords?: string[];
    newsSummary?: string;
    sourceUrls?: string[];
    originalStyleSummary?: string; // [NEW] Style DNA
    selectedRssItem?: NewsItem;
    blueprintXml?: string; // [NEW] The Architect's Plan
    draftText?: string;
    completedLevels?: ArticleWithAnalysis[];
    usage?: Record<string, any>;
    selectedRssId?: number;
}

// PipelineArgs interface update
export interface PipelineArgs {
    client: LLMClient;
    config?: PipelineConfig;
    currentDate: string;
    topicPreference: string;
    topics?: Topic[];
    candidateWords: string[];
    recentTitles?: string[];
    checkpoint?: PipelineCheckpoint | null;
    onCheckpoint?: (checkpoint: PipelineCheckpoint) => Promise<void>;
    excludeRssLinks?: string[];
    mode?: GenerationMode; // 策略模式：默认 'rss'
}

// ... inside runPipeline ...

export interface PipelineResult {
    output: DailyNewsOutput;
    selectedWords: string[];
    usage: Record<string, any>;
    selectedRssId?: number;
    selectedRssItem?: NewsItem;
}

// ============ 流水线核心逻辑 (Pipeline Core) ============

/**
 * 执行完整的文章生成流水线
 *
 * 逻辑流程:
 * Init -> [Checkpoint Restore] -> Stage 1 (选词) -> Stage 2a (Blueprint) -> Stage 2b (Writer) -> Stage 3 (JSON) -> Stage 4 (NLP) -> Result
 *
 * @param args 包含 LLM 客户端、运行时配置和 Checkpoint 数据
 */
export async function runPipeline(args: PipelineArgs): Promise<PipelineResult> {
    // 状态恢复区
    let selectedWords = args.checkpoint?.selectedWords || [];
    let newsSummary = args.checkpoint?.newsSummary || '';
    let sourceUrls = args.checkpoint?.sourceUrls || [];
    let originalStyleSummary = args.checkpoint?.originalStyleSummary;
    let selectedRssItem = args.checkpoint?.selectedRssItem;
    let blueprintXml = args.checkpoint?.blueprintXml || '';
    let draftText = args.checkpoint?.draftText || '';
    let usage: Record<string, any> = args.checkpoint?.usage || {};
    let selectedRssId = args.checkpoint?.selectedRssId;

    // "无状态服务"的有状态启动 (Stateful Resume for Stateless Service)
    const currentStage = args.checkpoint?.stage || 'start';
    const config = args.config || {};

    const strategy = getStrategy(args.mode);

    // [Stage 1] 搜索与选题 (Search & Selection)
    // -----------------------------------------------------------------------
    if (currentStage === 'start') {
        // [RSS Fetch] 尝试获取外部新闻，失败不阻断。
        let newsCandidates: NewsItem[] = [];
        try {
            const fetcher = new NewsFetcher();
            const topicIds = args.topics?.map(t => t.id) || [];
            newsCandidates = await fetcher.fetchAggregate(topicIds, args.currentDate, args.excludeRssLinks);
        } catch (error) {
            console.warn(`[Pipeline] Failed to fetch RSS news (falling back to pure search):`, error);
        }

        const stage1System = strategy.stage1.system;
        const stage1User = strategy.stage1.buildUser({
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate,
            recentTitles: args.recentTitles,
            topics: args.topics,
            newsCandidates,
        });

        const res = await args.client.runStage1_SearchAndSelection({
            candidateWords: args.candidateWords,
            topicPreference: args.topicPreference,
            currentDate: args.currentDate,
            recentTitles: args.recentTitles,
            topics: args.topics,
            newsCandidates,
            config,
            systemPrompt: stage1System,
            userPrompt: stage1User,
        });

        selectedWords = res.selectedWords;
        newsSummary = res.newsSummary;
        originalStyleSummary = res.originalStyleSummary;
        sourceUrls = res.sourceUrls;
        selectedRssId = res.selectedRssId;
        selectedRssItem = res.selectedRssItem;
        usage.search_selection = res.usage;

        console.log(`[Pipeline] Stage 1 Complete. Selected ${selectedWords.length} words.`);

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'search_selection',
                selectedWords,
                newsSummary,
                originalStyleSummary,
                sourceUrls,
                selectedRssId,
                usage
            });
        }
    }

    // [Stage 2a] The Architect (Blueprint Generation)
    // -----------------------------------------------------------------------
    // 角色: 架构师
    // 目标: 规划 narrative key beats, word placement, style DNA
    // -----------------------------------------------------------------------
    // Runs if we are at Start (0) or Resume at Search Selection (1)
    // Logic: "If I haven't done Stage 2a yet (am at start) OR I just finished Stage 1, do Stage 2a."
    if (['start', 'search_selection'].includes(currentStage)) {
        const stage2aSystem = strategy.stage2a.system;
        const stage2aUser = strategy.stage2a.buildUser({
            selectedWords,
            newsSummary,
            originalStyleSummary,
            sourceUrls,
            currentDate: args.currentDate,
            topicPreference: args.topicPreference,
        });

        const res = await args.client.runStage2a_Blueprint({
            selectedWords,
            newsSummary,
            originalStyleSummary,
            sourceUrls,
            currentDate: args.currentDate,
            topicPreference: args.topicPreference,
            config,
            systemPrompt: stage2aSystem,
            userPrompt: stage2aUser,
        });

        blueprintXml = res.blueprintXml;
        usage.blueprint = res.usage;

        console.log(`[Pipeline] Stage 2a Complete. Blueprint generated.`);

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'blueprint',
                selectedWords,
                newsSummary,
                originalStyleSummary,
                sourceUrls,
                blueprintXml,
                usage
            });
        }
    }

    // [Stage 2b] The Writer (Draft Generation)
    // -----------------------------------------------------------------------
    // 角色: 主笔
    // 目标: 风格化微缩 (Style Mirroring)
    // -----------------------------------------------------------------------
    // Runs if we are at Start(0) -> Search Selection(1) -> Blueprint(2)
    // Logic: "Fall-through execution. Continue if previous stages (Start/S1/S2a) are done."
    if (['start', 'search_selection', 'blueprint'].includes(currentStage)) {
        const stage2bSystem = strategy.stage2b.system;
        const stage2bUser = strategy.stage2b.buildUser({
            selectedWords,
            newsSummary,
            sourceUrls,
            currentDate: args.currentDate,
            blueprintXml,
        });

        const res = await args.client.runStage2b_Draft({
            blueprintXml,
            selectedWords,
            newsSummary,
            sourceUrls,
            currentDate: args.currentDate,
            config,
            systemPrompt: stage2bSystem,
            userPrompt: stage2bUser,
        });

        draftText = res.draftText;
        usage.draft = res.usage;

        console.log(`[Pipeline] Stage 2b Complete. Draft: ${draftText.length} chars.`);

        if (args.onCheckpoint) {
            await args.onCheckpoint({
                stage: 'writer',
                selectedWords,
                newsSummary,
                originalStyleSummary,
                sourceUrls,
                blueprintXml,
                draftText,
                usage
            });
        }
    }

    // [Stage 3] 结构化转换 (JSON Conversion)
    // -----------------------------------------------------------------------
    // 角色: Formatter (排版)
    // -----------------------------------------------------------------------

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
            originalStyleSummary,
            sourceUrls,
            blueprintXml,
            draftText,
            usage
        });
    }

    // [Stage 4] Syntax Analysis
    // -----------------------------------------------------------------------
    if (generation.output.articles && Array.isArray(generation.output.articles) && generation.output.articles.length > 0) {
        const completedFromCheckpoint = args.checkpoint?.completedLevels || [];

        console.log(`[Pipeline] Starting Stage 4 (Sentence Analysis)...`);

        const analysisRes = await args.client.runStage4_SentenceAnalysis({
            articles: generation.output.articles,
            completedLevels: completedFromCheckpoint,
            config,
            onLevelComplete: args.onCheckpoint ? async (completedArticles) => {
                // 增量保存
                await args.onCheckpoint!({
                    stage: 'grammar_analysis',
                    selectedWords,
                    newsSummary,
                    originalStyleSummary,
                    sourceUrls,
                    blueprintXml,
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
                originalStyleSummary,
                sourceUrls,
                blueprintXml,
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


