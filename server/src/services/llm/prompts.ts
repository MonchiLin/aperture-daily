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

export function buildSearchAndSelectionUserPrompt(args: {
  candidateWords: string[];
  topicPreference: string;
  currentDate: string;
  recentTitles?: string[];
}) {
  const candidateWordsText = args.candidateWords.map((w, i) => `${i + 1}. ${w}`).join('\n');
  const avoidTitlesSection = args.recentTitles?.length
    ? `\n<avoid_titles>\n以下是最近几天已生成的文章标题，请避免选择相同或高度相似的新闻主题：\n${args.recentTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n</avoid_titles>`
    : '';

  return `<context>
  <date>${args.currentDate}</date>
  <topic>${args.topicPreference}</topic>${avoidTitlesSection}
</context>

<candidate_words>
${candidateWordsText}
</candidate_words>

<task>
1. 搜索与上述候选词相关的新闻（优先搜索近一周内的新闻）
2. 分析搜索结果，找到一篇能够自然融入 4-7 个候选词的新闻
3. 从候选词中选出这 4-7 个词（优先选择靠前的词）
4. 撰写 150-250 字的新闻概括，确保选中的词汇都自然出现
5. 返回选中的词汇、新闻概括和 1 个最权威来源的真实 URL
</task>`;
}

/**
 * 分级写作规范
 * L1: 80-110词, 3段, 简单句, 现在时
 * L2: 140-170词, 4段, 复合句, 过去时
 * L3: 200-250词, 4-5段, 分析句, 混合时态
 */
const WRITING_GUIDELINES_XML = `
<guidelines>
  <level value="1" name="Elementary">
    <target>A1-A2 (初级)</target>
    <style>
      - 语气：简单、直白。就像是给学生看的“新闻摘要”。
      - 句子结构：短句为主。每句话传达一个主要信息。
      - 文章长度：80-110词，3段。
      - 词汇：高频词（前1000词）。
      - 时态：描述过去事件使用**一般过去时**（如 "The car hit the wall"）。陈述普遍事实使用一般现在时。
      - 关键要求：目标词必须以**纯文本**形式出现。
    </style>
  </level>
  <level value="2" name="Intermediate">
    <target>B1-B2 (中级)</target>
    <style>
      - 语气：标准新闻风格。生动且信息量大。
      - 句子结构：简单句与复合句混合。使用过渡词（However, Therefore, Meanwhile）展示逻辑。
      - 文章长度：140-170词，4段。
      - 时态：标准叙事时态（主要是过去时，少量现在完成时）。
      - 关键要求：目标词必须以**纯文本**形式出现。
    </style>
  </level>
  <level value="3" name="Advanced">
    <target>C1+ (高级)</target>
    <style>
      - 语气：老练、母语级新闻风格（类似《经济学人》或《纽约时报》）。
      - 句子结构：多变且复杂（倒装、虚拟语气、分词短语）。
      - 文章长度：200-250词，4-5段。
      - 内容：侧重分析、背景、语境和影响。
      - 关键要求：目标词必须以**纯文本**形式出现。
    </style>
  </level>
  <narrative_structure>
    <rule priority="HIGH">倒金字塔结构：最重要的信息（Who/What/When/Where）放在开头。</rule>
    <rule>确保段落间逻辑过渡自然。</rule>
  </narrative_structure>
  <general>
    <rule priority="CRITICAL">目标词必须是纯文本。禁止任何 markdown 格式（禁止使用 **, *, __）。</rule>
    <rule>像写自然的新闻故事一样写，不要写成事实罗列列表。</rule>
  </general>
</guidelines>`;


export const DRAFT_SYSTEM_INSTRUCTION = `${BASE_SYSTEM_ROLE}
<stage_role>
你目前的身份是：新闻撰稿人。
</stage_role>

${WRITING_GUIDELINES_XML}

<constraints>
  <rule priority="CRITICAL">所有文章内容必须使用英文撰写，包括标题、正文和所有段落。</rule>
  <rule>严格遵守上述分级写作规范。</rule>
  <rule>先写 Level 1，再写 Level 2，最后 Level 3。</rule>
  <rule priority="HIGH">文章标题应与原新闻标题风格相近，简洁有力，避免自创无关标题。</rule>
  <rule priority="CRITICAL">目标单词必须以纯文本形式书写，禁止使用任何 markdown 符号（如 **、*、__ 等）进行标记。</rule>
  <rule priority="CRITICAL">正文中严禁包含任何行内引用、数字角标或脚注（如 [1], [2], [1, 2]）。文章必须保持纯净。</rule>
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
**Morphological Freedom**: You may adapt the target word's form (tense, plurality, part of speech) to fit the grammatical context naturally.
- Example: If target is "go", you may write "went" or "gone".
- Example: If target is "beauty", you may write "beautiful".
**Do NOT shoehorn the exact string if it sounds robotic.**
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
  - \`word\`: Must be the EXACT string from the input list.
  - \`used_form\`: The actual form used in the text (e.g. if specific word is 'run' but text says 'ran', used_form is 'ran').
  - \`definitions\`: English definitions relevant to the context.
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
}) {
  return `<context>
  <target_words>${JSON.stringify(args.selectedWords)}</target_words>
  <urls>${JSON.stringify(args.sourceUrls)}</urls>
</context>

<input_text>
${args.draftText}
</input_text>

<task>
将 input_text 转换为 JSON。
</task>`;
}

// 兼容性导出
export const DAILY_NEWS_SYSTEM_PROMPT = BASE_SYSTEM_ROLE;

// Stage 4: Sentence Analysis
export const ANALYSIS_SYSTEM_INSTRUCTION = `You are a grammar analyzer specialized in English linguistic structure. 
Your task is to identify key structural roles like Subject, Verb, Object, and various clauses/phrases in the given text. 
Output strictly valid JSON.

<critical_rule priority="HIGHEST">
Even if you use search tools or have grounding metadata, you MUST generate the JSON output in the text field. 
Do NOT return empty text. 
Do NOT return only thoughts. 
The final output must be the JSON analysis.
</critical_rule>`;

