/**
 * Prompt 策略模块
 *
 * 核心设计：策略模式
 * - 每种生成模式 (GenerationMode) 对应一套 Prompt 策略
 * - Pipeline 根据 mode 选择对应的 Prompt 构建函数
 * - Provider 接口保持不变，只接收构建好的 Prompt
 *
 * 扩展方式：
 * 1. 创建 prompts.{mode}.ts
 * 2. 在此文件注册策略
 * 3. 在 queue.ts 添加入队方法
 */

import type { Stage1Input, Stage2Input } from './types';

// 现有 Prompt（normal 模式）
import {
    SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
    DRAFT_SYSTEM_INSTRUCTION,
    buildSearchAndSelectionUserPrompt,
    buildDraftGenerationUserPrompt,
} from './prompts';

// IMPRESSION 模式 Prompt
import {
    IMPRESSION_STAGE1_SYSTEM,
    IMPRESSION_STAGE2_SYSTEM,
    buildImpressionStage1User,
    buildImpressionStage2User,
} from './prompts.impression';

// ============ 类型定义 ============

/** 支持的生成模式 */
export type GenerationMode = 'normal' | 'impression';

/** buildUser 函数的输入类型（排除 Prompt 字段，因为这正是要构建的内容） */
export type Stage1BuildUserArgs = Omit<Stage1Input, 'systemPrompt' | 'userPrompt'>;
export type Stage2BuildUserArgs = Omit<Stage2Input, 'systemPrompt' | 'userPrompt'>;

/** 单阶段 Prompt 策略 */
export interface StagePromptStrategy<TInput> {
    /** System Instruction */
    system: string;
    /** User Prompt 构建函数 */
    buildUser: (args: TInput) => string;
}

/** 完整的 Prompt 策略（Stage 1 和 Stage 2） */
export interface PromptStrategy {
    stage1: StagePromptStrategy<Stage1BuildUserArgs>;
    stage2: StagePromptStrategy<Stage2BuildUserArgs>;
}

// ============ 策略注册 ============

export const strategies: Record<GenerationMode, PromptStrategy> = {
    /**
     * Normal 模式：每日文章生成
     * - 词汇来源：daily_word_references
     * - 新闻来源：RSS 优先，搜索兜底
     * - 选词策略：4-7 个
     */
    normal: {
        stage1: {
            system: SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
            buildUser: buildSearchAndSelectionUserPrompt,
        },
        stage2: {
            system: DRAFT_SYSTEM_INSTRUCTION,
            buildUser: buildDraftGenerationUserPrompt,
        },
    },

    /**
     * Impression 模式：大规模词汇文章
     * - 词汇来源：words 表随机选取（最多 1024）
     * - 新闻来源：纯联网搜索
     * - 选词策略：尽可能多（目标 30-50 个）
     */
    impression: {
        stage1: {
            system: IMPRESSION_STAGE1_SYSTEM,
            buildUser: buildImpressionStage1User,
        },
        stage2: {
            system: IMPRESSION_STAGE2_SYSTEM,
            buildUser: buildImpressionStage2User,
        },
    },
};

/**
 * 获取指定模式的 Prompt 策略
 *
 * @param mode 生成模式，默认 'normal'
 */
export function getStrategy(mode: GenerationMode = 'normal'): PromptStrategy {
    const strategy = strategies[mode];
    if (!strategy) {
        throw new Error(`Unknown generation mode: ${mode}`);
    }
    return strategy;
}
