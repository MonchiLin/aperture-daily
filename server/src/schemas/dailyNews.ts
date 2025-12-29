import { z } from 'zod';

export const dailyNewsArticleSchema = z.object({
    level: z.number().int().min(1).max(3),
    level_name: z.string().min(1),
    content: z.string().min(1),
    difficulty_desc: z.string().min(1)
});

export const wordDefinitionSchema = z.object({
    word: z.string(),
    phonetic: z.string(),
    definitions: z.array(z.object({
        pos: z.string(),
        definition: z.string()
    }))
});

export const dailyNewsOutputSchema = z
    // 严格输出 schema：强制来源 URL 与三档齐全，用于快速失败校验。
    .object({
        title: z.string().min(1),
        topic: z.string().min(1),
        sources: z.array(z.string().url()).min(1).max(8),
        articles: z.array(dailyNewsArticleSchema).length(3),
        word_usage_check: z.object({
            target_words_count: z.number().int().nonnegative(),
            used_count: z.number().int().nonnegative(),
            missing_words: z.array(z.string())
        }),
        word_definitions: z.array(wordDefinitionSchema)
    })
    .superRefine((value, ctx) => {
        const levels = new Set(value.articles.map((a) => a.level));
        for (const expected of [1, 2, 3]) {
            if (!levels.has(expected)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Missing article level: ${expected}`
                });
            }
        }
    });

export type DailyNewsOutput = z.infer<typeof dailyNewsOutputSchema>;
