// 生成流程中使用的 prompts
import dailyNewsPrompt from '../../../prompts/daily_news.md?raw';
import { WORD_SELECTION_MAX_WORDS } from './llmLimits';

const SYSTEM_PROMPT_START = '### System Prompt (系统提示词)';
const SYSTEM_PROMPT_END = '### User Instruction (用户指令)';

function extractDailyNewsSystemPrompt(source: string) {
	const startIndex = source.indexOf(SYSTEM_PROMPT_START);
	if (startIndex === -1) {
		throw new Error('daily_news.md missing "System Prompt (系统提示词)" section');
	}

	const afterStart = source.slice(startIndex + SYSTEM_PROMPT_START.length);
	const endIndex = afterStart.indexOf(SYSTEM_PROMPT_END);
	if (endIndex === -1) {
		throw new Error('daily_news.md missing "User Instruction (用户指令)" section');
	}

	const block = afterStart.slice(0, endIndex);
	const lines = block.split(/\r?\n/).map((line) => {
		if (line.startsWith('> ')) return line.slice(2);
		if (line.startsWith('>')) return line.slice(1);
		return line;
	});

	return lines.join('\n').trim();
}

export const DAILY_NEWS_SYSTEM_PROMPT = extractDailyNewsSystemPrompt(dailyNewsPrompt);

// 组合面向用户的提示词，注入运行时输入并包含硬性格式要求。
export function buildDailyNewsUserPrompt(args: {
	currentDate: string;
	targetVocabulary: string[];
	topicPreference: string;
}) {
	const vocabulary = JSON.stringify(args.targetVocabulary);
	return [
		'输入数据:',
		`CURRENT_DATE: "${args.currentDate}"`,
		`TARGET_VOCABULARY: ${vocabulary}`,
		`TOPIC_PREFERENCE: "${args.topicPreference}"`,
		'',
		'格式要求（重要）：',
		'- `articles[*].content` 必须是纯文本/Markdown，使用“正常段落排版”。',
		'- 段落之间用一个空行分隔（即包含 `\\n\\n`）。',
		'- 不要“一句一行”。每段建议 2-4 句。',
		'- 不要在正文里直接写出 CURRENT_DATE（除非是新闻本身需要）。',
		'',
		'词汇要求（重要）：',
		'- 自然优先：不要为了塞词牺牲可读性；允许少量缺失，并在 `missing_words` 中如实列出。',
		'',
		'请执行生成。'
	].join('\n');
}

export const WORD_SELECTION_SYSTEM_PROMPT = `你是一位 ESL 内容开发者。

【最终目标】
你将帮我完成一个三阶段任务：
1. 从候选词中选词（本阶段）
2. 搜索当日英文新闻
3. 写出三档难度的英语新闻文章（Easy/Medium/Hard）

【本阶段任务】
从下面的候选词中，选出最多 ${WORD_SELECTION_MAX_WORDS} 个「最适合写进当日新闻文章」的词。

【选词策略】
- 优先选「新词 + 到期」（type=new, due=true）
- 其次选「复习词 + 到期」（type=review, due=true）
- 最后选其他到期词
- 考虑这些词能否自然地融入一篇真实新闻故事
- 避免过于抽象或难以在新闻中使用的词

【输出格式 - 严格遵守，否则系统报错】
返回 JSON，字段名必须完全匹配：
{
  "selected_words": ["word1", "word2", "word3"],
  "selection_reasoning": "简要说明选择理由"
}

【关键约束】
1. 字段名必须是 "selected_words"（不是 "selected"，不是 "words"）
2. selected_words 必须是纯字符串数组，如 ["debate", "sector", "annual"]
3. 不要在数组中放对象，不要加 word/type/why 等嵌套结构
4. 不要添加 date 或其他额外字段
5. 只允许输出 "selected_words" 与 "selection_reasoning" 两个字段
6. 不要回显输入的日期、主题偏好或候选词列表
7. 如果你输出任何额外字段，系统会直接判定失败（不要冒险）`;

export function buildWordSelectionUserPrompt(args: {
	candidateWordsJson: string;
	topicPreference: string;
	currentDate: string;
}) {
	return `【候选词列表】
${args.candidateWordsJson}

【主题偏好】${args.topicPreference}
【日期】${args.currentDate}

请从候选词中选择最多 ${WORD_SELECTION_MAX_WORDS} 个适合写入当日英文新闻的词。
只输出 JSON 对象，不要代码块，不要解释，不要回显输入字段。`;
}

export function buildResearchUserPrompt(args: {
	selectedWords: string[];
	topicPreference: string;
	currentDate: string;
}) {
	return `【任务】
基于刚才选中的 ${args.selectedWords.length} 个词，搜索 ${args.currentDate} 的真实英文新闻。

【要求】
- 只搜索英文新闻源（如 BBC, CNN, Reuters, The Guardian, AP News 等）
- 找到一个与选中词汇相关的新闻事件
- 主题偏好：${args.topicPreference}
- 返回 3-6 条关键事实（英文）+ 2-5 个英文来源 URL

【禁止】
- 不要使用中文新闻源
- 不要翻译中文新闻

【选中的词汇】
${args.selectedWords.join(', ')}

请搜索新闻并返回研究笔记。`;
}

export const DAILY_NEWS_SCHEMA_HINT = [
	'OUTPUT_SCHEMA (top-level JSON keys must match EXACTLY):',
	'{',
	'  "title": string,',
	'  "topic": string,',
	'  "sources": string[],  // 2-5 source URLs',
	'  "articles": [',
	'    {"level": 1, "level_name": string, "content": string, "difficulty_desc": string},',
	'    {"level": 2, "level_name": string, "content": string, "difficulty_desc": string},',
	'    {"level": 3, "level_name": string, "content": string, "difficulty_desc": string}',
	'  ],',
	'  "word_usage_check": {',
	'    "target_words_count": number,',
	'    "used_count": number,',
	'    "missing_words": string[]',
	'  },',
	'  "word_definitions": [',
	'    {',
	'      "word": string,',
	'      "phonetic": string,  // IPA, e.g. "/trænˈzɪʃən/"',
	'      "definitions": [',
	'        {"pos": string, "definition": string}  // pos: "n.", "v.", "adj." etc. definition: Chinese',
	'      ]',
	'    }',
	'  ]',
	'}'
].join('\n');

export function buildDraftGenerationUserPrompt(args: {
	selectedWords: string[];
	sourceUrls: string[];
	systemPrompt: string;
	currentDate: string;
	topicPreference: string;
}) {
	const baseUserPrompt = buildDailyNewsUserPrompt({
		currentDate: args.currentDate,
		targetVocabulary: args.selectedWords,
		topicPreference: args.topicPreference
	});
	return `【任务】
基于刚才的研究笔记和选中的词汇，生成三档难度的英语新闻文章草稿（不要输出 JSON）。

【已收集的来源 URL】
${JSON.stringify(args.sourceUrls)}

【文章规范】
${args.systemPrompt}

【基础指令】
${baseUserPrompt}

【输出格式（严格遵守）】
- TITLE: <标题>
- TOPIC: <主题>
- SOURCES:
  - <url1>
  - <url2>
- LEVEL_1_NAME: <难度名>
- LEVEL_1_CONTENT:
  <正文段落，正常段落排版>
- LEVEL_1_DIFFICULTY_DESC: <难度描述>
- LEVEL_2_NAME: <难度名>
- LEVEL_2_CONTENT:
  <正文段落，正常段落排版>
- LEVEL_2_DIFFICULTY_DESC: <难度描述>
- LEVEL_3_NAME: <难度名>
- LEVEL_3_CONTENT:
  <正文段落，正常段落排版>
- LEVEL_3_DIFFICULTY_DESC: <难度描述>
- WORD_DEFINITIONS:
  - word: <词汇>
    phonetic: <IPA>
    definitions:
      - pos: <词性>
        definition: <中文释义>

【词汇释义要求】
- 必须提供 word_definitions 数组
- 为每个选中的词汇提供：
  - phonetic: IPA 音标，如 "/trænˈzɪʃən/"
  - definitions: 中文释义数组，每项包含 pos（词性如 n./v./adj.）和 definition（中文解释）

请输出草稿文本，不要 JSON，不要代码块。`;
}

export function buildJsonConversionUserPrompt(args: {
	draftText: string;
	sourceUrls: string[];
	selectedWords: string[];
}) {
	return `【任务】
将下面的草稿内容转换为严格 JSON（不允许多余文本）。

【草稿内容】
${args.draftText}

【可用来源 URL（若草稿中缺失）】
${JSON.stringify(args.sourceUrls)}

【固定 schema】
${DAILY_NEWS_SCHEMA_HINT}

【要求】
- 仅输出 JSON 对象，不要代码块，不要解释。
- 不要改写草稿内容，只做结构化整理。
- sources 优先来自草稿的 SOURCES；若缺失再用可用来源 URL 补齐。
- word_usage_check 请根据 articles 内容与目标词列表统计：
  - target_words_count = ${args.selectedWords.length}
  - used_count = 实际出现的目标词数量
  - missing_words = 未出现的目标词
- 目标词列表：
${args.selectedWords.join(', ')}
`;
}
