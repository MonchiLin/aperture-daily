/**
 * Stage 4: Grammar Structure Analysis (Word-Index Based)
 * 
 * Uses word-level tokenization and index-based tagging to avoid text mutation issues.
 * The LLM outputs word index ranges, and we compute character offsets deterministically.
 */

import { type GeminiClient, type GeminiRequest, type GeminiResponse, extractGeminiText, safeGeminiCall } from './geminiClient';
import type { GeminiStructureData, GeminiStructureResponse, StructureRole } from './types';
import { tokenize, tokenRangeToCharOffset, formatTokensForPrompt, extractTextForRange, type Token } from './tokenizer';

type ArticleItem = {
    level: 1 | 2 | 3;
    content: string;
    level_name: string;
    difficulty_desc: string;
    title?: string;
    structure?: GeminiStructureData;
};

interface XRayAnalysisInput {
    client: GeminiClient;
    model: string;
    articles: ArticleItem[];
}

interface UsageAccumulator {
    [key: string]: GeminiResponse['usageMetadata'];
}

// All 14 structure roles
const STRUCTURE_ROLES: readonly StructureRole[] = [
    's', 'v', 'o', 'io', 'cmp',      // Core components
    'rc', 'pp', 'adv', 'app',        // Clauses & Phrases
    'pas', 'con',                     // Voice & Connectives
    'inf', 'ger', 'ptc'              // Non-finite verbs
];

/**
 * Parse LLM response as JSON array of word-index structures
 */
function parseStructureResponse(text: string): GeminiStructureResponse {
    // Extract JSON from possible markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1]!.trim() : text.trim();

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
    }

    // Validate each item
    return parsed.map((item, idx) => {
        if (!item.words || !Array.isArray(item.words)) {
            throw new Error(`Item ${idx}: missing or invalid 'words' array`);
        }
        if (item.words.length < 1 || item.words.length > 2) {
            throw new Error(`Item ${idx}: 'words' must have 1 or 2 elements`);
        }
        if (!item.role || !STRUCTURE_ROLES.includes(item.role.toLowerCase())) {
            throw new Error(`Item ${idx}: invalid role '${item.role}'`);
        }

        return {
            words: item.words.length === 1
                ? [item.words[0]] as [number]
                : [item.words[0], item.words[1]] as [number, number],
            role: item.role.toLowerCase() as StructureRole
        };
    });
}

/**
 * Convert word-index response to character-offset structure data
 */
function convertToStructureData(
    response: GeminiStructureResponse,
    tokens: Token[],
    originalText: string
): GeminiStructureData {
    const results: GeminiStructureData = [];

    for (const item of response) {
        const wordStart = item.words[0];
        const wordEnd = item.words.length === 2 ? item.words[1] : item.words[0];

        // Validate indices - fail fast, no fallback
        if (wordStart < 0 || wordStart >= tokens.length) {
            throw new Error(`Invalid word start index: ${wordStart} (max: ${tokens.length - 1})`);
        }
        if (wordEnd < wordStart || wordEnd >= tokens.length) {
            throw new Error(`Invalid word end index: ${wordEnd} (start: ${wordStart}, max: ${tokens.length - 1})`);
        }

        const offsets = tokenRangeToCharOffset(tokens, wordStart, wordEnd);
        const extract = extractTextForRange(originalText, tokens, wordStart, wordEnd);

        results.push({
            start: offsets.start,
            end: offsets.end,
            role: item.role,
            extract
        });
    }

    // Sort by start position
    results.sort((a, b) => a.start - b.start);

    return results;
}

/**
 * Build the system prompt for word-index based grammar analysis
 */
function buildGrammarPrompt(wordList: string): string {
    return `<role>
你是一名专门从事"句法结构标注"的语言专家。分析英语文本的语法结构，以词索引方式输出标注。
</role>

<input_format>
带编号的词汇列表：
[0] The
[1] scientists
[2] discovered
...
</input_format>

<output_format>
JSON 数组，每个元素：
- "words": [n] 或 [start, end]（索引范围，包含两端）
- "role": 语法角色代码

示例：
\`\`\`json
[{"words":[0,1],"role":"s"},{"words":[2,4],"role":"v"},{"words":[5,6],"role":"o"}]
\`\`\`
</output_format>

<roles>
【句子成分】
  s   = 主语 (Subject)
  v   = 谓语 (Verb) ← 完整动词短语
  o   = 直接宾语 (Direct Object)
  io  = 间接宾语 (Indirect Object)
  cmp = 补语 (Complement)

【从句短语】
  rc  = 定语从句 (Relative Clause)
  pp  = 介词短语 (Prepositional Phrase)
  adv = 状语 (Adverbial)
  app = 同位语 (Appositive)

【特殊标记】
  pas = 被动语态 (Passive)
  con = 连接词 (Connective)
  inf = 不定式 (Infinitive)
  ger = 动名词 (Gerund)
  ptc = 分词 (Participle)
</roles>

<rules>
1. V 必须覆盖完整谓语短语（助动词+主动词作为整体）
   ✓ can do, has been eating, will be done
   ✗ 不要分开标注

2. 区分谓语与非谓语
   - V = 主句谓语
   - INF/GER/PTC = 非谓语动词

3. 被动语态同时标 V 和 PAS

4. 间接宾语(IO)：gave [him] [a book] → him=IO, a book=O

5. 必须标注所有 S-V-O 成分，标题也标注

6. 【嵌套限制】从句(RC)、介词短语(PP)、非谓语(INF/GER/PTC)内部不标注 S/V/O 等成分，只将整体标为一个单位
   ✓ "who led the team" 整体标为 RC
   ✗ 不要在 RC 内部再标 S/V/O

7. 只输出 JSON
</rules>

<words>
${wordList}
</words>

请分析语法结构，输出 JSON 数组。`;
}

export async function runGeminiGrammarAnalysis(args: XRayAnalysisInput): Promise<{ articles: ArticleItem[], usage: UsageAccumulator }> {
    const usageAccumulator: UsageAccumulator = {};
    const results: ArticleItem[] = [];

    for (const article of args.articles) {
        if (!article.content) {
            results.push(article);
            continue;
        }

        const plainText = article.content;

        // 1. Tokenize the text
        const tokens = tokenize(plainText);
        console.log(`[Stage 4] Level ${article.level}: Tokenized ${tokens.length} words from ${plainText.length} chars`);

        if (tokens.length === 0) {
            console.warn(`[Stage 4] Level ${article.level}: No tokens found, skipping`);
            results.push(article);
            continue;
        }

        // 2. Format tokens for prompt
        const wordList = formatTokensForPrompt(tokens);
        const systemPrompt = buildGrammarPrompt(wordList);

        const request: GeminiRequest = {
            contents: [
                { role: 'user', parts: [{ text: systemPrompt }] },
            ],
        };

        try {
            console.log(`[Stage 4] Analyzing Level ${article.level}...`);

            const response = await safeGeminiCall(`Stage4_Level${article.level}`, async () => {
                return args.client.generateContent(args.model, request);
            });

            if (response.usageMetadata) {
                const k = `level_${article.level}`;
                usageAccumulator[k] = response.usageMetadata;
            }

            const responseText = extractGeminiText(response);

            // 3. Parse LLM response
            const structureResponse = parseStructureResponse(responseText);
            console.log(`[Stage 4] Level ${article.level}: LLM returned ${structureResponse.length} structures`);

            // 4. Convert to character offsets
            const structureData = convertToStructureData(structureResponse, tokens, plainText);
            console.log(`[Stage 4] Level ${article.level}: Converted to ${structureData.length} offset-based structures`);

            results.push({
                ...article,
                structure: structureData
            });

        } catch (e) {
            console.error(`[Stage 4] Failed for Level ${article.level}:`, e);
            const message = e instanceof Error ? e.message : 'Unknown error';
            throw new Error(`Stage 4 (Structure Analysis) failed for Level ${article.level}: ${message}`);
        }
    }

    return {
        articles: results,
        usage: usageAccumulator
    };
}
