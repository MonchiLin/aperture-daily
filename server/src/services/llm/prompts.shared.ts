/**
 * Prompt 共享常量
 *
 * 包含所有生成模式共用的 XML 片段，避免重复维护。
 * - LEVELS_XML: CEFR 三级难度规则
 * - FORMATTING_XML: 输出格式规则
 * - buildStage2UserContext: 通用的 Stage 2 用户上下文构建器
 */

import type { Stage2Input } from './types';

// ============ 共享的难度规则 ============

export const LEVELS_XML = `  <levels>
    <level id="1" name="Elementary (初级)">
      <target_audience>CEFR A2 学习者</target_audience>
      <constraints>
        - 词数: 90 - 120 words
        - 句法: 仅使用简单句 (SVO) 和基础并列句 (and/but)。避免从句。
        - 时态: 仅使用一般现在时、一般过去时。
        - 风格: 直白、清晰，类似 VOA Special English。
      </constraints>
    </level>

    <level id="2" name="Intermediate (中级)">
      <target_audience>CEFR B1/B2 学习者</target_audience>
      <constraints>
        - 词数: 150 - 200 words
        - 句法: 引入定语从句 (who/which) 和状语从句 (when/because)。
        - 风格: 标准新闻报道风格，客观、专业。
      </constraints>
    </level>

    <level id="3" name="Advanced (高级)">
      <target_audience>CEFR C1 学习者</target_audience>
      <constraints>
        - 词数: 250 - 300 words
        - 句法: 复杂的句式结构，包含倒装、虚拟语气、长难句。
        - 风格: 本土化表达，类似《经济学人》或《纽约时报》的深度分析风格。
      </constraints>
    </level>
  </levels>`;

// ============ 共享的格式规则 ============

export const FORMATTING_XML = `  <formatting>
    <rule>Target words must be kept in PLAIN TEXT. DO NOT use markdown bolding (e.g., **word**).</rule>
    <rule>Form adaptation (morphology) is allowed and encouraged for natural flow (e.g., run -> ran/running).</rule>
  </formatting>`;

// ============ 共享的 Stage 2 User Prompt 上下文 ============

/** Stage 2 上下文构建所需的最小字段 */
export type Stage2ContextArgs = Pick<Stage2Input, 'currentDate' | 'selectedWords' | 'sourceUrls' | 'newsSummary'>;

/**
 * 构建 Stage 2 的通用上下文部分
 * 各模式可在此基础上定制 <mission> 部分
 */
export function buildStage2Context(args: Stage2ContextArgs): string {
    return `
<context>
    <date>${args.currentDate}</date>
    <target_words count="${args.selectedWords.length}">${JSON.stringify(args.selectedWords)}</target_words>
    <source_urls>${args.sourceUrls.join(', ')}</source_urls>
</context>

<news_material>
${args.newsSummary}
</news_material>`;
}
