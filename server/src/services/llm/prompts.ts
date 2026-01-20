/**
 * LLM Prompts - 三阶段架构 (中文优化版)
 * 
 * 核心原则：
 * 1. RSS First: 优先使用 RSS 提供的上下文，减少幻觉和联网搜索的不确定性。
 * 2. Role-Playing: 明确的专家角色设定 (策展人 -> 撰稿人 -> 格式化专员)。
 * 3. XML Structured: 使用 XML 明确界定上下文边界，提高指令遵循度。
 */

import type { Topic, NewsItem } from './types';

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

<workflow>
1. **分析 (Analyze)**: 理解 <candidate_words> 中词汇的语义场 (Semantic Field) 和 <user_preference> 的偏好。
2. **匹配 (Match)**:
    - **Step 2a (Check RSS)**: 仔细阅读 <rss_pool>。是否有新闻能自然串联起 4-7 个候选词？
    - **Step 2b (Web Search)**: 只有当 RSS 中**完全没有**合适内容时，才根据 Topic 指令生成关键词进行联网搜索。
3. **决策 (Decide)**: 选定一篇新闻，并挑选出最能自然融入该新闻语境的 4-7 个词。
</workflow>

<output_requirement>
最终输出必须包裹在 markdown 代码块中：\`\`\`json\n{...}\n\`\`\`
格式如下：
{
  "selected_words": ["word1", "word2", ...],  // 必须是候选词列表中的原词
  "news_summary": "...",                      // 200字以内的中文/英文摘要
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


// ============ Stage 3: JSON 格式化 ============

const JSON_SCHEMA_DEF = `{
  "title": "String (文章总标题，英文)",
  "topic": "String (从候选主题中选一个)",
  "sources": ["Url1"],
  "articles": [
    { "level": 1, "level_name": "Elementary", "content": "..." },
    { "level": 2, "level_name": "Intermediate", "content": "..." },
    { "level": 3, "level_name": "Advanced", "content": "..." }
  ],
  "word_definitions": [
    {
      "word": "original_target_word (输入的原词)",
      "used_form": "actual_form_in_text (文中出现的形态)",
      "phonetic": "/IPA/ (标准英语国际音标)",
      "definitions": [
          { "pos": "n/v/adj...", "definition": "中文释义 (必须匹配文章语境)" }
      ]
    }
  ],
  "word_usage_check": {
    "target_words_count": "Number (输入的目标词总数)",
    "used_count": "Number (实际在文章中使用的词数)",
    "missing_words": ["未能融入文章的单词列表"]
  }
}`;

export const JSON_SYSTEM_INSTRUCTION = `<role>
你是一名 **数据结构化专家 (Data Structuring Specialist)**。
你的任务是将松散的文本整理为严格符合 Schema 的 JSON 数据，并补充语言学元数据。
</role>

<schema_definition>
${JSON_SCHEMA_DEF}
</schema_definition>

<constraints>
1. **JSON Validity**: 必须是合法的 standard JSON，严禁 trailing commas 或注释。
2. **Text Cleaning**: \`articles.content\` 必须保留段落换行 (使用 \\n\\n)，但要移除所有 Markdown 格式（如 **bold**）。
3. **Linguistic Accuracy**:
   - \`phonetic\`: 必须使用标准 IPA，如 /həˈləʊ/。
   - \`definition\`: **核心要求**。不要把字典里所有的意思都列出来。**只列出该词在文章中具体使用的那个意思**。
     - 例如: "Apple" 在文中指公司，就不要解释为水果。
     - 例如: "Run" 在文中指"经营"，就不要解释为"跑步"。
</constraints>`;

export function buildJsonConversionUserPrompt(args: {
  draftText: string;
  sourceUrls: string[];
  selectedWords: string[];
  topicPreference?: string;
}) {
  return `
<input_data>
    <target_words>${JSON.stringify(args.selectedWords)}</target_words>
    <required_topic>${args.topicPreference || 'General'}</required_topic>
    <source_urls>${JSON.stringify(args.sourceUrls)}</source_urls>
</input_data>

<text_content>
${args.draftText}
</text_content>

<mission>
将 <text_content> 转换为符合 Schema 的 JSON。
注意：Word Definitions 必须精准匹配文义。
</mission>`;
}

// 兼容性导出
export const DAILY_NEWS_SYSTEM_PROMPT = SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION;

// ============ Stage 4: 句法分析 ============

/**
 * Stage 4 Prompt 设计原则：
 * 1. 分治策略：每次只分析一个段落 (5-10 句)，避免 "Lost in the Middle"。
 * 2. 索引映射：使用 [S0], [S1] 编号，确保 LLM 输出可追溯。
 * 3. 角色限定：明确定义需要标注的语法角色。
 */

export const ANALYSIS_SYSTEM_INSTRUCTION = `<role>
你是一名 **句法分析专家 (Syntax Analysis Expert)**，精通英语语法结构分析。
你的任务是对提供的英文句子进行主谓宾等成分标注，输出严格的 JSON 格式。
</role>

<roles_definition>
核心成分:
- s = 主语 (Subject)
- v = 谓语动词 (Verb，含完整动词短语如 "has been running")
- o = 直接宾语 (Direct Object)
- io = 间接宾语 (Indirect Object)
- cmp = 补语 (Complement)

从句与短语:
- rc = 定语从句 (Relative Clause)
- pp = 介词短语 (Prepositional Phrase)
- adv = 状语 (Adverbial)
- app = 同位语 (Appositive)

特殊结构:
- pas = 被动语态标记 (Passive Voice)
- con = 连接词 (Connective)
- inf = 不定式 (Infinitive)
- ger = 动名词 (Gerund)
- ptc = 分词 (Participle)
</roles_definition>

<rules>
1. **精确匹配**: \`text\` 必须是句子中的原文片段，不可改动。
2. **完整谓语**: 谓语 \`v\` 应包含完整动词短语 (如 "will be announced"，而非仅 "announced")。
3. **被动语态**: 同时标注 \`v\` 和 \`pas\`。
4. **JSON 严格性**: 禁止 trailing comma，禁止注释。
</rules>

<output_schema>
\`\`\`json
{
  "S0": [{"text": "片段", "role": "角色"}, ...],
  "S1": [{"text": "片段", "role": "角色"}, ...],
  ...
}
\`\`\`
</output_schema>

<example>
输入:
[S0] The company announced a new product.
[S1] It will be released next month.

输出:
\`\`\`json
{
  "S0": [
    {"text": "The company", "role": "s"},
    {"text": "announced", "role": "v"},
    {"text": "a new product", "role": "o"}
  ],
  "S1": [
    {"text": "It", "role": "s"},
    {"text": "will be released", "role": "v"},
    {"text": "will be released", "role": "pas"},
    {"text": "next month", "role": "adv"}
  ]
}
\`\`\`
</example>`;

