/**
 * [Prompt Strategy Registry (promptStrategies.ts)]
 * ------------------------------------------------------------------
 * 功能：管理不同生成模式 (RSS vs Impression) 的 Prompt 构建逻辑。
 *
 * 核心架构: **Strategy Pattern (策略模式)**
 * - 意图：将"如何构建 Prompt"的逻辑从 Pipeline 中解耦。Pipeline 只管调用 `buildUser()`，不关心是 RSS 新闻还是随机单词。
 * - 扩展性：新增模式只需实现 `Strategy` 接口并在 `strategies` 对象注册，无需修改 Pipeline 代码 (OCP 原则)。
 */

import type { Stage1Input, Stage2aInput, Stage2bInput } from './types';

// 现有 Prompt（normal 模式）
import {
    SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
    buildSearchAndSelectionUserPrompt,
} from './prompts.rss';

// IMPRESSION 模式 Prompt
import {
    IMPRESSION_STAGE1_SYSTEM,
    buildImpressionStage1User,
} from './prompts.impression';

// [NEW] Stage 2a/2b Prompts
import {
    BLUEPRINT_SYSTEM_INSTRUCTION,
    buildBlueprintUserPrompt
} from './prompts.stage2.blueprint';

import {
    WRITER_SYSTEM_INSTRUCTION,
    buildWriterUserPrompt,
    type WriterUserArgs
} from './prompts.stage2.writer';

// ============ 类型定义 ============

/** 支持的生成模式 */
export type GenerationMode = 'rss' | 'impression';

/** buildUser 函数的输入类型（排除 Prompt 字段） */
export type Stage1BuildUserArgs = Omit<Stage1Input, 'systemPrompt' | 'userPrompt'>;
export type Stage2aBuildUserArgs = Omit<Stage2aInput, 'systemPrompt' | 'userPrompt'>;
export type Stage2bBuildUserArgs = Omit<Stage2bInput, 'systemPrompt' | 'userPrompt'>;

/** 单阶段 Prompt 策略 */
export interface StagePromptStrategy<TInput> {
    /** System Instruction */
    system: string;
    /** User Prompt 构建函数 */
    buildUser: (args: TInput) => string;
}

/** 完整的 Prompt 策略 */
export interface PromptStrategy {
    stage1: StagePromptStrategy<Stage1BuildUserArgs>;
    stage2a: StagePromptStrategy<Stage2aBuildUserArgs>;
    stage2b: StagePromptStrategy<Stage2bBuildUserArgs>;
}

// ============ 策略注册 ============

export const strategies: Record<GenerationMode, PromptStrategy> = {
    /**
     * Normal 模式：每日文章生成
     */
    rss: {
        stage1: {
            system: SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION,
            buildUser: buildSearchAndSelectionUserPrompt,
        },
        stage2a: {
            system: BLUEPRINT_SYSTEM_INSTRUCTION,
            buildUser: buildBlueprintUserPrompt,
        },
        stage2b: {
            system: WRITER_SYSTEM_INSTRUCTION,
            buildUser: (args) => buildWriterUserPrompt(args as WriterUserArgs),
        }
    },

    /**
     * Impression 模式：大规模词汇文章
     */
    impression: {
        stage1: {
            system: IMPRESSION_STAGE1_SYSTEM,
            buildUser: buildImpressionStage1User,
        },
        // Impression 模式暂复用 RSS 的 Stage 2a/2b 逻辑，后续可定制
        stage2a: {
            system: BLUEPRINT_SYSTEM_INSTRUCTION,
            buildUser: buildBlueprintUserPrompt,
        },
        stage2b: {
            system: WRITER_SYSTEM_INSTRUCTION,
            buildUser: (args) => buildWriterUserPrompt(args as WriterUserArgs),
        }
    },
};

/**
 * 获取指定模式的 Prompt 策略
 *
 * @param mode 生成模式，默认 'normal'
 */
export function getStrategy(mode: GenerationMode = 'rss'): PromptStrategy {
    const strategy = strategies[mode];
    if (!strategy) {
        throw new Error(`Unknown generation mode: ${mode}`);
    }
    return strategy;
}
