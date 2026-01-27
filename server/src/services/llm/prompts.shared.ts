/**
 * Prompt 共享常量
 *
 * 包含所有生成模式共用的 XML 片段，避免重复维护。
 * - LEVELS_XML: CEFR 三级难度规则
 * - FORMATTING_XML: 输出格式规则
 * - buildStage2UserContext: 通用的 Stage 2 用户上下文构建器
 * - JSON_SCHEMA_DEF: Stage 3 JSON 结构定义
 * - ANALYSIS_SYSTEM_INSTRUCTION: Stage 4 句法分析指令
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

// ============ 共享的风格分析指令 (Style Extraction) ============

export const STYLE_EXTRACTION_INSTRUCTION = `<style_analysis_rules>
1. **Identify Tone**: Is it sarcastic, authoritative, playful, or dry?
2. **Analyze Structure**: Does it start with an anecdote? Does it use bullet points?
3. **Extract Signature**: What makes this author unique? (e.g., "Heavy use of data", "Short punchy sentences").
Output a concise summary (max 50 words) describing the "Style DNA".
</style_analysis_rules>`;

// ============ 共享的 Stage 2 User Prompt 上下文 ============

/** Stage 2 上下文构建所需的最小字段 */
export type Stage2ContextArgs = {
  currentDate: string;
  selectedWords: string[];
  sourceUrls: string[];
  newsSummary: string;
  originalStyleSummary?: string; // [NEW] 为 Stage 2a/2b 提供风格参考
};

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
    ${args.originalStyleSummary ? `<original_style_summary>${args.originalStyleSummary}</original_style_summary>` : ''}
</context>

<news_material>
${args.newsSummary}
</news_material>`;
}


// ============ Stage 3: JSON 格式化 (Shared) ============

const JSON_SCHEMA_DEF = `{
  "title": "String (文章总标题，英文)",
  "topic": "String (从候选主题中选一个)",
  "sources": ["Url1"],
  "articles": [
    { 
      "level": 1, 
      "level_name": "Elementary", 
      "content": "..."
      // Level 1 必须保持简单，不要包含 pull_quote 或 summary
    },
    { 
      "level": 2, 
      "level_name": "Intermediate", 
      "content": "...",
      "summary": "String (Lead paragraph, max 50 words)"
    },
    { 
      "level": 3, 
      "level_name": "Advanced", 
      "content": "...",
      "summary": "String (Lead paragraph)"
    }
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
4. **Level Constraints**:
    - **Level 1**: **严禁**生成 \`summary\`，保持版面极简。
    - **Level 2/3**: **必须**生成不为空的 \`summary\`。
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

// ============ Stage 4: 句法分析 (Shared) ============

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
