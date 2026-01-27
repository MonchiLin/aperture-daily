/**
 * [LLM Prompt Architecture: RSS Strategy]
 * ------------------------------------------------------------------
 * 核心原则 (Core Philosophy):
 * 1. **RSS First (Truth Grounding)**: 
 *    - 优先使用 RSS 提供的上下文，将其作为"Ground Truth"。
 *    - 只有当 RSS 无法满足时，才允许 LLM 调用搜索工具 (Fallback)。
 * 2. **Role-Playing (Expert Persona)**: 
 *    - Stage 1: Curator (策展人) -> 负责筛选和连接。
 *    - Stage 2: Journalist (记者) -> 负责叙事和分级。
 * 3. **XML Boundaries**: 使用 `<tag>` 明确分隔上下文，防止指令注入 (Prompt Injection) 和上下文混淆。
 */

import type { Topic, NewsItem } from './types';

import { STYLE_EXTRACTION_INSTRUCTION } from './prompts.shared';

// ============ Stage 1: 搜索与选题 ============

export const SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION = `<role>
你是一名拥有20年经验的**资深多语种新闻策展人 (Senior Content Curator)**。
你擅长从海量信息中精准捕捉具有教育价值的真实新闻，并能敏锐地发现词汇与新闻事件之间的深层语义联系。
</role>

<core_philosophy>
**真实性是生命线**。
1. **RSS 优先 (RSS First)**: 你的首要任务是评估 "<rss_pool>" 中的推荐新闻。如果其中有高质量且匹配候选词的新闻，**直接采用**，不要舍近求远去联网搜索。
2. **拒绝幻觉**: 绝不捏造新闻。所有事实必须基于提供的 RSS 上下文或真实的联网搜索结果。
3. **时效性**: 仅关注 <task_date> 前后 7 天内发生的事件（task_date 是目标生成日期，可能是历史日期）。
</core_philosophy>

${STYLE_EXTRACTION_INSTRUCTION}

<workflow>
1. **分析 (Analyze)**: 理解 <candidate_words> 中词汇的语义场 (Semantic Field) 和 <user_preference> 的偏好。
2. **匹配 (Match)**:
    - **Step 2a (Check RSS)**: 仔细阅读 <rss_pool>。是否有新闻能自然串联起 4-7 个候选词？
    - **Step 2b (Web Search)**: 只有当 RSS 中**完全没有**合适内容时，才根据 Topic 指令生成关键词进行联网搜索。
3. **决策 (Decide)**: 选定一篇新闻，并挑选出最能自然融入该新闻语境的 4-7 个词。
4. **风格提取 (Extract)**: 按照 <style_analysis_rules> 分析所选新闻的风格。
</workflow>

<output_requirement>
最终输出必须包裹在 markdown 代码块中：\`\`\`json\n{...}\n\`\`\`
格式如下：
{
  "selected_words": ["word1", "word2", ...],  // 必须是候选词列表中的原词
  "news_summary": "...",                      // 200字以内的中文/英文摘要
  "original_style_summary": "...",            // [NEW] Max 50 words style DNA
  "source": "...",                            // 来源 URL (RSS link 或 搜索到的 link)
  "selected_rss_id": 3                        // 如果从 RSS 池选择，返回对应 item 的 id；如果来自搜索则省略此字段
}
</output_requirement>`;

export function buildSearchAndSelectionUserPrompt(args: {
  candidateWords: string[];
  topicPreference: string;
  currentDate: string;
  recentTitles?: string[];
  topics?: Topic[];
  newsCandidates?: NewsItem[];
}) {
  // 1. 构建 RSS Pool 上下文
  let rssContext = '<rss_pool status="empty" />';
  if (args.newsCandidates && args.newsCandidates.length > 0) {
    const items = args.newsCandidates.map((item, i) => `
    <item id="${i + 1}">
        <title>${item.title}</title>
        <source>${item.sourceName}</source>
        <summary>${item.summary}</summary>
        <link>${item.link}</link>
        <date>${item.pubDate}</date>
    </item>`).join('\n');

    rssContext = `
<rss_pool status="available">
    <instruction priority="HIGHEST">
        以下是来自即时 feeds 的高可信新闻。
        **强烈建议**优先从中选择，除非它们与候选词完全风马牛不相及。
    </instruction>
    ${items}
</rss_pool>`;
  }

  // 2. 构建 Topic 上下文 (Simplified)
  // User: Topic acts merely as a category tag for RSS.
  // We don't need detailed definitions since RSS content is already filtered/provided.
  const topicContext = `<user_topic_preference>${args.topicPreference}</user_topic_preference>`;

  return `
<context_data>
    <task_date description="目标生成日期，新闻应围绕此日期前后 7 天">${args.currentDate}</task_date>
    <history_avoidance>
        ${args.recentTitles?.join('; ') || 'None'}
    </history_avoidance>
    ${topicContext}
    ${rssContext}
</context_data>

<candidate_words>
${JSON.stringify(args.candidateWords)}
</candidate_words>

<mission>
请执行策展流程。
如果 RSS Pool 中有合适新闻（能串联起 >=4 个词），请直接使用该新闻，并在 reasoning 中注明 "Selected from RSS"。
如果必须搜索，请生成搜索查询。
最终返回 JSON。
</mission>`;
}


// ============ Stage 2: 草稿生成 ============

import { LEVELS_XML, FORMATTING_XML, buildStage2Context } from './prompts.shared';

const WRITING_GUIDELINES_XML = `
<guidelines>
  <core_principle>
    文章必须基于真实事实 (News Facts)，但语言风格必须严格适配 CEFR 分级标准。
    三篇文章应讲述同一个故事，但使用不同的语言复杂度。
  </core_principle>

${LEVELS_XML}

${FORMATTING_XML}
</guidelines>`;

export const DRAFT_SYSTEM_INSTRUCTION = `<role>
你是一名 **ESL 教育专家 (ESL Education Expert)** 兼 **资深双语记者**。
你的专长是将同一则新闻改写为不同难度的分级阅读材料，帮助学习者通过语境掌握词汇。
</role>

${WRITING_GUIDELINES_XML}

<workflow>
1. **事实提取 (Fact Card)**: 从提供的新闻摘要中提取 5 个核心要素 (Who, What, When, Where, Why)。
2. **草稿撰写 (Drafting)**: 
    - 依次撰写 Level 1, Level 2, Level 3 三篇文章。
    - 确保每篇文章都尽量自然地包含所有目标词 (Selected Words)。
    - **严禁**为了包含单词而生硬造句。如果某个词实在无法融入 Level 1，可以在 Level 2/3 中再体现，但最好都包含。
</workflow>

<output_requirement>
直接输出三篇文章的纯文本内容，并在每篇前标注 [Level X]。
不要返回 JSON，专注于写作质量。
</output_requirement>`;

export function buildDraftGenerationUserPrompt(args: {
  selectedWords: string[];
  newsSummary: string;
  sourceUrls: string[];
  currentDate: string;
}) {
  return `${buildStage2Context(args)}

<mission>
请基于 <news_material>，使用英文为我撰写三级分级阅读文章。
必须包含所有 target_words。
</mission>`;
}

