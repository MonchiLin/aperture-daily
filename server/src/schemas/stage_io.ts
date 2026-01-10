
import { z } from 'zod';
import { dailyNewsOutputSchema } from './dailyNews';

// ============ 阶段 1: 搜索与选题 (Search & Selection) ============

/**
 * Stage 1 输出契约
 * 
 * 职责：作为 Pipeline 的“编辑”，决定今天要写什么新闻，以及教什么单词。
 * 数据源：NewsApi, GNews 或 User Topic Preference。
 * 关键字段：
 * - selected_words: 必须选出至少 1 个单词供后续生成使用。
 * - news_summary: 汇总后的新闻背景，为了节省 Token，Stage 2 将直接使用此摘要而非原始网页。
 */

export const Stage1OutputSchema = z.object({
    selected_words: z.array(z.string()).min(1, 'At least one word must be selected'),
    news_summary: z.string().min(10, 'News summary too short'),
    source: z.string().optional(),
    sources: z.array(z.string()).optional(),
});

export type Stage1OutputDTO = z.infer<typeof Stage1OutputSchema>;


// ============ 阶段 2: 草稿生成 (Draft Generation) ============

/**
 * Stage 2 输出契约
 * 
 * 职责：作为 Pipeline 的“作家”，专注于撰写流畅、自然的英文文章。
 * 设计哲学：此阶段 *不要求* 输出 JSON。为什么？
 * 1. 专注度：让 LLM 专注于叙事结构和词汇运用，避免 JSON 格式错误带来的干扰。
 * 2. 鲁棒性：纯文本输出的成功率极高，几乎不会因为括号不匹配等语法问题失败。
 */

export const Stage2OutputSchema = z.object({
    draftText: z.string().min(100, 'Draft text too short (min 100 chars)')
});

export type Stage2OutputDTO = z.infer<typeof Stage2OutputSchema>;


// ============ 阶段 3: 结构化转换 (JSON Conversion) ============

/**
 * Stage 3 输出契约
 * 
 * 职责：作为 Pipeline 的“排版”，将纯文本转化为结构化数据。
 * 复用性：直接复用最终的 DailyNewsOutputSchema，确保此时产出的数据已符合落库标准。
 * 包含：如果 Stage 2 生成的草稿只有一个难度，Stage 3 需负责将其改写为 Level 1/2/3 三个版本。
 */

export const Stage3OutputSchema = dailyNewsOutputSchema;

export type Stage3OutputDTO = z.infer<typeof Stage3OutputSchema>;


// ============ 阶段 4: 句法分析 (Sentence Analysis) ============

/**
 * Stage 4 输出契约 (Paragraph Chunk)
 * 
 * 职责：作为 Pipeline 的“语言学家”，分析句子成分。
 * 实现细节：此 Schema 验证的是 LLM *单次段落分析* 的原始 JSON 响应。
 * 
 * 结构说明：Record<句子ID, 标注列表>
 * 例如：{ "S0": [{ text: "apple", role: "s" }], "S1": [...] }
 * 
 * 注意：最终落库时，这些数据会被 analyzer.ts 转换为全局 Offset 格式 (AnalysisAnnotation)。
 */

export const ParagraphAnalysisSchema = z.record(
    z.string(),
    z.array(
        z.object({
            text: z.string(),
            role: z.string()
        })
    )
);
