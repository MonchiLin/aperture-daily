/**
 * IMPRESSION 模式专用 Prompt
 *
 * 与 Normal 模式的核心区别：
 * 1. Stage 1：跳过 RSS，强制联网搜索，选词目标 30-50 个
 * 2. Stage 2：在遵守难度规则的前提下最大化词汇使用
 *
 * 设计原则：
 * - 完全独立于现有 prompts.ts，不影响原流程
 * - 参考现有 Prompt 的 XML 结构化风格
 */

import type { Stage1BuildUserArgs, Stage2BuildUserArgs } from './promptStrategies';

// ============ Stage 1: 搜索与选词 (IMPRESSION 版) ============

export const IMPRESSION_STAGE1_SYSTEM = `<role>
你是一名拥有20年经验的**资深多语种新闻策展人 (Senior Content Curator)**，同时也是一位**词汇教学专家 (Vocabulary Pedagogy Specialist)**。
你擅长从大规模词汇库中发现语义关联，并能通过联网搜索找到能最大化融入这些词汇的真实新闻事件。
</role>

<core_philosophy>
**词汇覆盖最大化**。
1. **语义聚类 (Semantic Clustering)**: 面对大量候选词（可能多达数百个），你的首要任务是识别其中的语义场分布。哪些词属于科技领域？哪些属于商业？哪些是通用高频词？
2. **新闻适配 (News Matching)**: 基于语义聚类结果，联网搜索近期真实新闻，找到能自然融入最多候选词的那一条。
3. **拒绝幻觉**: 绝不捏造新闻。所有事实必须基于真实的联网搜索结果。
4. **时效性**: 仅关注 <task_date> 前后 7 天内发生的事件。
</core_philosophy>

<workflow>
1. **语义分析 (Semantic Analysis)**: 
   - 扫描 <candidate_words> 中的所有词汇
   - 识别 3-5 个主要语义场 (如: Technology, Business, Health, Entertainment)
   - 找出高频可用词（能出现在多种话题中的通用词汇）

2. **新闻搜索 (News Search)**:
   - 基于最大的语义场，构建搜索关键词
   - 执行联网搜索，获取近期新闻
   - 评估每条新闻能融入多少候选词

3. **词汇选择 (Word Selection)**:
   - 从候选词中选出**所有**能自然融入选定新闻的词汇
   - 目标：30-50 个词（越多越好，但必须能自然使用）
   - 包括可通过词形变化融入的词（run -> running, ran）
</workflow>

<selection_criteria>
词汇是否入选的判断标准：
1. **直接相关**: 词汇与新闻主题直接相关（如 "stock" 出现在金融新闻中）
2. **语境可用**: 词汇可在描述新闻时自然使用（如 "announce" 可用于任何发布类新闻）
3. **形态适配**: 词汇的某种形态可融入（如 "success" -> "successful", "successfully"）
4. **排除标准**: 若某词与新闻完全无关且强行使用会显得牵强，则不选
</selection_criteria>

<output_requirement>
最终输出必须包裹在 markdown 代码块中：\`\`\`json\\n{...}\\n\`\`\`
格式如下：
{
  "selected_words": ["word1", "word2", ...],  // 从候选词中选出的所有可用词（目标 30-50 个）
  "news_summary": "...",                      // 300字以内的新闻摘要（中文或英文皆可）
  "source": "...",                            // 新闻来源 URL
  "semantic_analysis": {                      // 语义分析结果（可选，供调试参考）
    "primary_field": "Technology",            // 最主要的语义场
    "secondary_fields": ["Business", "Science"]
  }
}
</output_requirement>`;

export function buildImpressionStage1User(args: Stage1BuildUserArgs): string {
  return `
<context_data>
    <task_date description="目标生成日期，新闻应围绕此日期前后 7 天">${args.currentDate}</task_date>
    <history_avoidance description="避免与近期文章主题重复">
        ${args.recentTitles?.join('; ') || 'None'}
    </history_avoidance>
    <candidate_count>${args.candidateWords.length}</candidate_count>
</context_data>

<candidate_words description="大规模候选词库，请从中尽可能多地选择可用词汇">
${JSON.stringify(args.candidateWords)}
</candidate_words>

<mission>
请执行词汇策展流程：
1. 分析候选词的语义分布，识别主要语义场
2. 联网搜索能最大化融入候选词的真实新闻
3. 从候选词中选出所有能自然融入该新闻的词汇（目标 30-50 个）
4. 返回 JSON 结果
</mission>`;
}

// ============ Stage 2: 草稿生成 (IMPRESSION 版) ============

import { LEVELS_XML, FORMATTING_XML, buildStage2Context } from './prompts.shared';

export const IMPRESSION_STAGE2_SYSTEM = `<role>
你是一名 **ESL 教育专家 (ESL Education Expert)** 兼 **资深双语记者**。
你的专长是将同一则新闻改写为不同难度的分级阅读材料，并能在有限篇幅内最大化词汇覆盖。
</role>

<guidelines>
  <core_principle>
    文章必须基于真实事实 (News Facts)，语言风格必须严格适配 CEFR 分级标准。
    三篇文章应讲述同一个故事，但使用不同的语言复杂度。
    **核心挑战**：你收到了大量目标词汇（30-50 个），需要在三篇文章中尽可能多地自然融入。
  </core_principle>

${LEVELS_XML}

  <word_integration_strategy>
    <principle>在保证文章自然流畅的前提下，最大化词汇使用</principle>
    <techniques>
      - **形态变化 (Morphology)**: 积极使用词汇的各种形态（run -> ran, running, runner）
      - **分级分布**: 简单常用词优先放入 Level 1，复杂学术词放入 Level 3
      - **同义替换**: 如果目标词和文中已有词同义，优先使用目标词
      - **自然优先**: 绝不为了塞词而牺牲可读性，宁可少用也不要生硬
    </techniques>
  </word_integration_strategy>

${FORMATTING_XML}
</guidelines>

<output_requirement>
直接输出三篇文章的纯文本内容，并在每篇前标注 [Level X]。
不要返回 JSON，专注于写作质量和词汇覆盖。
</output_requirement>`;

export function buildImpressionStage2User(args: Stage2BuildUserArgs): string {
  return `${buildStage2Context(args)}

<mission>
请基于 <news_material>，使用英文撰写三级分级阅读文章。
**核心目标**：在遵守各级别词数和句法约束的前提下，尽可能多地使用 target_words 中的词汇。
每个词汇可以使用其任意形态变化。
</mission>`;
}

