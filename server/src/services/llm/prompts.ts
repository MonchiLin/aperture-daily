/**
 * LLM Prompts - 三阶段架构
 * 
 * Stage 1: 搜索 + 选词
 * Stage 2: 草稿生成（三档分级文章）
 * Stage 3: JSON 转换 + 词汇释义
 */

// Base System Role - 所有阶段继承
const BASE_SYSTEM_ROLE = `<role>
You are an ESL content expert specializing in CEFR-aligned graded reading materials.
</role>
<language priority="CRITICAL">All article content MUST be written in English.</language>`;

// Stage 1: 搜索 + 选词
// 
// 策略：Research-First (先调研后决策)
// 为什么要强制 "Search First"? 
// 因为 LLM 的训练数据有截止日期。为了生成“最新”新闻，必须让它先联网获取 Context，再基于真实 Context 进行选词。
// 否则它可能会编造假新闻或使用过时信息。
export const SEARCH_AND_SELECTION_SYSTEM_INSTRUCTION = `${BASE_SYSTEM_ROLE}
<stage_role>
你目前的身份是：智能新闻策展人。
你的任务是先搜索与候选词相关的最新新闻，然后选出能融入同一篇新闻的词汇。
</stage_role>

<workflow>
1. 接收候选词列表（用户今天需要学习/复习的词汇）
2. 搜索与这些词汇相关的最新新闻（优先搜索近一周内的新闻）
3. 分析搜索结果，找到一篇能自然融入 4-7 个候选词的真实新闻
4. 从候选词中选出这 4-7 个词（优先选择能融入同一新闻的词组合）
5. 返回选中的词汇、新闻概括和来源 URL
</workflow>

<content_policy>
  <source_principles>
    - 优先选择英文原版报道
    - 使用权威专业媒体，避免个人博客、自媒体或用户生成内容
    - 确保来源 URL 真实可访问
  </source_principles>
  <exclusions>
    - 政治争议、党派辩论、选举相关内容
    - 暴力犯罪、恐怖袭击、令人不适的内容
    - 宗教冲突、敏感社会议题
  </exclusions>
</content_policy>

<constraints>
  <rule priority="CRITICAL">必须搜索真实新闻，优先搜索近一周内（距离当前日期7天内）的新闻。</rule>
  <rule priority="HIGH">**语义聚合**：选出的词汇必须形成一个语义相关的组合（如“经济+市场+货币”），坚决避免生硬拼凑毫不相关的词（如“量子物理”和“烹饪”）。</rule>
  <rule>优先选择候选词列表中靠前的词。</rule>
  <rule priority="HIGH">只返回 1 个最权威的真实新闻来源 URL。</rule>
  <rule priority="HIGH">如果提供了 avoid_titles 列表，必须选择与之不同的新闻主题/事件。避免选择相同、高度相似或仅是同一事件不同报道角度的新闻，确保内容多样性。</rule>
  <rule priority="CRITICAL">最终响应必须在 markdown 代码块中包含 JSON，格式：\`\`\`json\n{...}\n\`\`\`</rule>
</constraints>

<output_format>
\`\`\`json
{
  "selected_words": ["word1", "word2", ...],
  "news_summary": "新闻概括（150-250字）",
  "source": "https://example.com/news/article-url"
}
\`\`\`
</output_format>`;

import type { Topic } from './types';

export function buildSearchAndSelectionUserPrompt(args: {
  candidateWords: string[];
  topicPreference: string;
  currentDate: string;
  recentTitles?: string[];
  topics?: Topic[];
}) {
  const candidateWordsText = args.candidateWords.map((w, i) => `${i + 1}. ${w}`).join('\n');
  const avoidTitlesSection = args.recentTitles?.length
    ? `\n<avoid_titles>\n以下是最近几天已生成的文章标题，请避免选择相同或高度相似的新闻主题：\n${args.recentTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n</avoid_titles>`
    : '';

  // [NEW] Dynamic Topic Definitions
  let topicContext = `<topic>${args.topicPreference}</topic>`;

  if (args.topics && args.topics.length > 0) {
    const topicDefinitions = args.topics.map(t => `
    <topic_definition id="${t.label}">
        <name>${t.label}</name>
        <custom_instruction>${t.prompts || 'No specific instructions.'}</custom_instruction>
    </topic_definition>`).join('\n');

    topicContext = `
<candidate_topics>
    ${topicDefinitions}
</candidate_topics>
<topic_instruction>
    You must choose ONE topic from the <candidate_topics> list above that best fits the candidate words.
    Once chosen, you MUST follow that topic's <custom_instruction> for your search strategy.
</topic_instruction>`;
  }

  return `<context>
  <date>${args.currentDate}</date>
  ${topicContext}${avoidTitlesSection}
</context>

<candidate_words>
${candidateWordsText}
</candidate_words>

<task>
1. Analyze the candidate words and select the most suitable topic from the list (if provided).
2. Search for the LATEST news matching that topic's custom instructions (prioritize news within the last 7 days).
3. Find a news story that naturally integrates 4-7 candiate words.
4. Select those 4-7 words.
5. Return the selected topic name (as 'topic'), selected words, news summary, and source URL.
</task>`;
}

/**
 * 分级写作规范 (Graded Reading Standards)
 * 
 * 为什么选择 XML 格式?
 * XML 标签 (<level>, <target>, <style>) 比 Markdown 或自然语言更能明确地界定“上下文边界”。
 * LLM 处理 XML 结构的指令时，通常表现出更好的遵循性 (Compliance)，尤其是在复杂的条件约束下。
 */
// 1. Fact Card (事实防幻觉)
// 2. New Level Specs (精准分级)
// 3. Natural Integration (自然植入)

const WRITING_GUIDELINES_XML = `
<guidelines>
  <fact_control priority="CRITICAL">
    写文章前，必须先从新闻中提取“事实卡片 (Fact Card)”：包含 Who, When, Where, What, Why, Numbers。
    写文章时严禁编造或篡改这些事实。
  </fact_control>

  <levels>
    <level value="1" name="Elementary">
      <specs>90-140词 | 6-9句</specs>
      <style>
        - 结构：短句为主，单句单意。
        - 语调：教育性，类似 VOA 慢速英语。
      </style>
    </level>
    <level value="2" name="Intermediate">
      <specs>140-220词 | 8-12句</specs>
      <style>
        - 结构：简单句与复合句结合。
        - 语调：标准新闻风格，专业且自然。
        - 内容：聚焦事件叙述。
      </style>
    </level>
    <level value="3" name="Advanced">
      <specs>220-340词 | 10-16句</specs>
      <style>
        - 结构：复杂句式（倒装/虚拟/条件）。
        - 语调：深度分析风格（如经济学人）。
        - 内容：包含背景、分析和引用。
      </style>
    </level>
  </levels>
  
  <insertion_strategy>
    <instruction>如果单词不能自然融入，不要强行造句，确保“语境自然”：</instruction>
    <examples>
      <good>Target: "recipe". 句子：Success in space exploration requires a complex [recipe] of engineering and courage. (比喻用法)</good>
      <good>Target: "CEO". 句子：Tim Cook, the [CEO] of Apple, announced... (自然同位语)</good>
    </examples>
  </insertion_strategy>

  <general>
    <rule>目标词必须纯文本，禁止 Markdown。</rule>
    <rule>三篇文章基于同一事实内核。</rule>
  </general>
</guidelines>`;

export const DRAFT_SYSTEM_INSTRUCTION = `${BASE_SYSTEM_ROLE}
<stage_role>你是一名专业新闻撰稿人及 ESL 教育专家。</stage_role>

${WRITING_GUIDELINES_XML}

<workflow>
1. 分析：阅读新闻概括及来源。
2. 事实卡片：提取 5 个核心事实放入 <fact_card> 标签。
3. 写作：基于卡片依次撰写 Level 1/2/3 文章。
</workflow>

<constraints>
  <rule>必须先输出 XML 格式的 <fact_card>。</rule>
  <rule>文章内容必须全英文。</rule>
  <rule>严格遵守字数/句数限制。</rule>
  <rule>灵活使用植入策略，确保自然。</rule>
  <rule>禁止行内引用 (如 [1])。</rule>
</constraints>`;

export function buildDraftGenerationUserPrompt(args: {
  selectedWords: string[];
  newsSummary: string;
  sourceUrls: string[];
  currentDate: string;
  topicPreference: string;
}) {
  return `<context>
  <date>${args.currentDate}</date>
  <topic>${args.topicPreference}</topic>
  <target_words>${JSON.stringify(args.selectedWords)}</target_words>
</context>

<news_context>
${args.newsSummary}
</news_context>

<sources>
${args.sourceUrls.join('\n')}
</sources>

<task>
基于上述新闻撰写三篇分级文章（Level 1, 2, 3）。

<language_requirement priority="CRITICAL">
文章必须全部使用英文撰写，包括标题和正文。
</language_requirement>

<length_requirements>
- Level 1 (Easy): 80-110 词，3 段，简单句（过去时/现在时）。
- Level 2 (Medium): 140-170 词，4 段，标准新闻风格。
- Level 3 (Hard): 200-250 词，4-5 段，高级词汇与深度分析。
</length_requirements>

<critical_reminder>
Target words must be PLAIN TEXT. NO markdown formatting.
**Morphological Freedom (形态自由)**: 
为了让文章读起来更自然，避免"机器味"：
You may adapt the target word's form (tense, plurality, part of speech) to fit the grammatical context naturally.
- Example: If target is "go", you may write "went" or "gone".
- Example: If target is "beauty", you may write "beautiful".
**Do NOT shoehorn (生硬插入) the exact string if it sounds robotic.**
</critical_reminder>
</task>`;
}

// Stage 3: JSON 转换
const JSON_SCHEMA_DEF = `{
  "title": "String (标题格式)",
  "topic": "String",
  "sources": ["Url1"],
  "articles": [
    { "level": 1, "level_name": "Easy", "content": "..." },
    { "level": 2, "level_name": "Medium", "content": "..." },
    { "level": 3, "level_name": "Hard", "content": "..." }
  ],
  "word_usage_check": { "target_words_count": 5, "used_count": 5, "missing_words": [] },
    "word_definitions": [
      {
        "word": "original_target_word",
        "used_form": "actual_form_in_text",
        "phonetic": "/.../",
        "definitions": [{ "pos": "n", "definition": "...（中文释义）" }]
      }
    ]
  }

  IMPORTANT rules for \`word_definitions\`:
  - \`word\`: 必须是输入列表中的**原词** (EXACT string)。
  - \`used_form\`: 文章中实际使用的变形形式 (例如原词是 'run' 但文中用了 'ran'，这里填 'ran')。
  - \`definitions\`: 基于文章语境的英文释义。
}`;

export const JSON_SYSTEM_INSTRUCTION = `${BASE_SYSTEM_ROLE}
<stage_role>
你目前的身份是：数据格式化专员。
</stage_role>

<output_schema>
${JSON_SCHEMA_DEF}
</output_schema>

<constraints>
  <rule>必须生成符合 schema 的有效 JSON。</rule>
  <rule>articles.content MUST preserve paragraph breaks using explicit "\n\n" characters. Do NOT produce a single block of text.</rule>
  <rule priority="CRITICAL">
    word_definitions 必须基于该词在文章中的实际语境：
    1. 只提供文章中使用的那个义项（如 "appeal" 用作"呼吁"，则只给"呼吁"的释义）
    2. 词性(pos)必须与文章用法一致
    3. 如果文章用作动词，释义不能给名词含义
  </rule>
  <rule priority="HIGH">
    phonetic 字段必须使用标准 IPA (International Phonetic Alphabet) 格式：
    - 使用斜杠包裹：/ˈsɪɡnəl/
    - 禁止使用点分隔符标注音节（如 /ˈsɪɡ.nəl/ 是错误的）
    - 重音符号使用 ˈ（主重音）和 ˌ（次重音）
    - 正确示例：/ˈsiːnəri/, /ɪnˈdʒʊərəns/, /ˌaʊtˈdɔːr/
  </rule>
  <rule>补充 word_definitions（IPA音标 + 中文释义）。</rule>
  <rule priority="CRITICAL">检查并移除 articles.content 中所有目标词周围的 markdown 符号，确保纯文本输出。</rule>
</constraints>`;

export function buildJsonConversionUserPrompt(args: {
  draftText: string;
  sourceUrls: string[];
  selectedWords: string[];
  topicPreference?: string;
}) {
  return `<context>
  <target_words>${JSON.stringify(args.selectedWords)}</target_words>
  <urls>${JSON.stringify(args.sourceUrls)}</urls>
  <required_topic>${args.topicPreference || 'General'}</required_topic>
</context>

<input_text>
${args.draftText}
</input_text>

<task>
将 input_text 转换为 JSON。
**Critical Rule**: The "topic" field in the output JSON MUST be ONE OF the topics listed in <required_topic> (if multiple are provided). If only one is provided, use it exactly.
</task>`;
}

// 兼容性导出
export const DAILY_NEWS_SYSTEM_PROMPT = BASE_SYSTEM_ROLE;

// Stage 4: Sentence Analysis
export const ANALYSIS_SYSTEM_INSTRUCTION = `你是一位专注于英语语言结构的语法分析专家。
你的任务是识别给定文本中的关键句法角色，如主语 (Subject)、谓语 (Verb)、宾语 (Object) 以及各种从句/短语。
请输出严格也就是合法的 JSON。

<critical_rule priority="HIGHEST">
即使你使用了搜索工具或拥有基础元数据，你**必须**在 text 字段中生成 JSON 输出。
**不要**返回空文本。
**不要**只返回思考过程。
最终输出必须是 JSON 分析结果。
</critical_rule>`;
