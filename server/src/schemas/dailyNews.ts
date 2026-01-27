import { z } from 'zod';

export const dailyNewsArticleSchema = z.object({
    level: z.number().int().min(1).max(3),
    level_name: z.string().min(1),
    content: z.string().min(1),
    // 语法分析数据 (Standoff Grammar Data)
    // 采用 "Standoff" 模式存储：结构信息仅记录 start/end 偏移量，而不修改 content 字符串本身。
    // 这种设计允许前端自由应用高亮，而不破坏原文的完整性。
    structure: z.any().optional(),

    summary: z.string().optional().describe("A brief 50-word intro/lead paragraph.")
});

export type DailyNewsArticle = z.infer<typeof dailyNewsArticleSchema>;

export const wordDefinitionSchema = z.object({
    word: z.string(),
    // used_form: 单词在文章中实际出现的形式 (如 "running" vs lemma "run")。
    // 前端高亮时需要同时匹配原型和变体。
    used_form: z.string().optional(),
    phonetic: z.string(),
    definitions: z.array(z.object({
        pos: z.string(), // Part of Speech (n., v., adj.)
        definition: z.string()
    }))
});

export type WordDefinition = z.infer<typeof wordDefinitionSchema>;

export const dailyNewsOutputSchema = z
    .object({
        title: z.string().min(1),
        topic: z.string().min(1),
        // 来源校验：限制数量以避免 UI 溢出，强制 URL 格式。
        sources: z.array(z.url()).min(1).max(8),
        // 强制要求必须生成 Level 1-3 三篇文章。
        articles: z.array(dailyNewsArticleSchema).length(3),
        word_usage_check: z.object({
            target_words_count: z.number().int().nonnegative(),
            used_count: z.number().int().nonnegative(),
            // LLM 自检：如果生成的文章遗漏了选定的单词，列在这里。
            missing_words: z.array(z.string())
        }),
        word_definitions: z.array(wordDefinitionSchema)
    })
    // 业务规则校验：确保 articles 数组中确实包含了 Level 1, 2, 3 各一篇
    .superRefine((value, ctx) => {
        const levels = new Set(value.articles.map((a) => a.level));
        for (const expected of [1, 2, 3]) {
            if (!levels.has(expected)) {
                ctx.addIssue({
                    code: 'custom',
                    message: `Missing article level: ${expected}`
                });
            }
        }
    });

export type DailyNewsOutput = z.infer<typeof dailyNewsOutputSchema>;
