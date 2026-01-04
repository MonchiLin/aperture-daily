
import { type GeminiClient, type GeminiRequest, type GeminiResponse, extractGeminiText, safeGeminiCall } from './geminiClient';
import type { GeminiStructureData } from './types';
import { parseInlineTags, validateParseResult } from './parseInlineTags';

/**
 * Stage 4: Grammar Structure Analysis (Structure X-Ray) for Multi-Level Articles
 * 
 * 使用内联标签方式，让 LLM 直接在文本中标注结构，然后由代码解析出精确偏移量。
 * 这比要求 LLM 计算偏移量更可靠，因为偏移量由确定性代码计算。
 */

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

export async function runGeminiGrammarAnalysis(args: XRayAnalysisInput): Promise<{ articles: ArticleItem[], usage: UsageAccumulator }> {
    const usageAccumulator: UsageAccumulator = {};
    const results: ArticleItem[] = [];

    for (const article of args.articles) {
        if (!article.content) {
            results.push(article);
            continue;
        }

        // 直接使用 article.content (已经是纯文本)
        const plainText = article.content;

        const systemPrompt = `<role>
你是一名专门从事“句法结构标注”的语言专家。你的任务是在原文的基础上添加语法结构标签，用于英语学习者的辅助阅读。
你的任务非常关键：输出的文本在**剔除所有 XML 标签后，必须与原文实现“字符级” 100% 匹配**。
</role>

<rules>
  1. **【最高优先级】字符完整性**：严禁修改、增加或删除原文中的任何字符。
     - 禁止在标签周围添加额外的空格或换行。
  2. **【XML 规范】**：所有标签必须严格成对闭合。
     - 支持的标签：<S>, <V>, <O>, <RC>, <PP>, <PAS>, <CON>。
  3. **【覆盖范围】**：必须标注所有句子，包括文章的第一行（标题）。
  4. **【分句标注】**：仅标注主句或独立分局的成分。允许嵌套。
  5. **【零容错】**：你的输出将被程序进行字符级校验。任何细微的变动（如漏掉标点、多出换行）都会导致系统报错。
</rules>

<available_tags>
  <S>主语 (Subject)</S>
  <V>谓语动词 (Verb)</V>
  <O>宾语 (Object)</O>
  <RC>定语从句 (Relative Clause)</RC>
  <PP>介词短语 (Prepositional Phrase)</PP>
  <PAS>被动语态 (Passive Voice)</PAS>
  <CON>连接词 (Connective)</CON>
</available_tags>

<examples>
输入：However, scientists discovered a new species.
输出：<CON>However</CON>, <S>scientists</S> <V>discovered</V> <O>a new species</O>.

输入：Cai Lei is fighting ALS.
输出：<S>Cai Lei</S> <V>is fighting</V> <O>ALS</O>.

输入：The room was cleaned by the staff.
输出：<S>The room</S> <V><PAS>was cleaned</PAS></V> <PP>by the staff</PP>.
</examples>

<input_text>
${plainText}
</input_text>

<output_format>
- 直接输出原文添加标签后的结果。
- 禁止任何解释、Markdown 代码块外观（如 \`\`\`json）或前缀。
- 段落间隔与原文完全一致。
</output_format>`;

        const request: GeminiRequest = {
            contents: [
                { role: 'user', parts: [{ text: systemPrompt }] },
            ],
        };

        try {
            console.log(`[Stage 4] Tagging Level ${article.level}... (Text Length: ${plainText.length})`);

            const response = await safeGeminiCall(`Stage4_Level${article.level}`, async () => {
                return args.client.generateContent(args.model, request);
            });

            if (response.usageMetadata) {
                const k = `level_${article.level}`;
                usageAccumulator[k] = response.usageMetadata;
            }

            const taggedText = extractGeminiText(response);

            // 解析内联标签，提取结构数据
            const parseResult = parseInlineTags(taggedText);

            // 验证解析结果 (Strict Integrity Check)
            const validation = validateParseResult(parseResult, plainText);
            if (!validation.valid) {
                const errorMsg = `[Stage 4] INTEGRITY FAILURE for Level ${article.level}:\n${validation.errors.join('\n')}`;
                console.error(errorMsg);
                // Fail Fast as requested
                throw new Error(errorMsg);
            }

            console.log(`[Stage 4] Level ${article.level}: Found ${parseResult.structures.length} structures`);

            results.push({
                ...article,
                structure: parseResult.structures
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
