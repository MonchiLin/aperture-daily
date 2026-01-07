import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

import { AppError } from '../src/errors/AppError';

export const articlesRoutes = new Elysia({ prefix: '/api/articles' })
    .get('/:id', async ({ params: { id } }) => {
        const articleRows = await db.all(sql`SELECT * FROM articles WHERE id = ${id} LIMIT 1`) as any[];
        if (articleRows.length === 0) throw AppError.notFound();
        const article = articleRows[0]!;

        let task = null;
        if (article.generation_task_id) {
            const taskRows = await db.all(sql`SELECT * FROM tasks WHERE id = ${article.generation_task_id} LIMIT 1`);
            task = taskRows.length > 0 ? taskRows[0] : null;
        }

        // [Normalization] Fetch variants and vocab from new tables
        // 1. Variants
        const variants = await db.all(sql`
            SELECT level, level_label, title, content, structure_json, sentences_json 
            FROM article_variants 
            WHERE article_id = ${id} 
            ORDER BY level ASC
        `) as any[];

        // 2. Vocabulary
        const vocabRows = await db.all(sql`
            SELECT v.id as vocab_id, v.word, v.phonetic, d.part_of_speech, d.definition 
            FROM article_vocabulary v 
            LEFT JOIN article_vocab_definitions d ON v.id = d.vocab_id 
            WHERE v.article_id = ${id}
        `) as any[];

        // Group vocab definitions
        const vocabMap = new Map<string, any>();
        for (const row of vocabRows) {
            if (!vocabMap.has(row.vocab_id)) {
                vocabMap.set(row.vocab_id, {
                    word: row.word,
                    phonetic: row.phonetic,
                    definitions: []
                });
            }
            if (row.part_of_speech && row.definition) {
                vocabMap.get(row.vocab_id).definitions.push({
                    pos: row.part_of_speech,
                    definition: row.definition
                });
            }
        }
        const wordDefinitions = Array.from(vocabMap.values());

        // Reconstruct content_json for frontend compatibility
        // Only override if normalized data exists (implies migration or dual-write succeeded)
        if (variants.length > 0) {
            const reconstructed = {
                result: {
                    title: article.title,
                    sources: article.source_url ? [article.source_url] : [],
                    articles: variants.map(v => ({
                        level: v.level,
                        // Fix for mismatched property names if any
                        level_label: v.level_label,
                        title: v.title,
                        content: v.content,
                        structure: v.structure_json ? JSON.parse(v.structure_json) : [],
                        sentences: v.sentences_json ? JSON.parse(v.sentences_json) : []
                    })),
                    word_definitions: wordDefinitions
                }
            };
            article.content_json = JSON.stringify(reconstructed);
        }

        return { articles: article, tasks: task };
    })
    .patch('/:id/read', async ({ params: { id }, body }) => {
        const { level } = body as { level: number };
        if (level === undefined) return { status: "error", message: "level required" };

        // L1 -> 1 (001), L2 -> 3 (011), L3 -> 7 (111)
        const mask = (1 << level) - 1;

        await db.run(sql`
            UPDATE articles 
            SET read_levels = (read_levels | ${mask})
            WHERE id = ${id}
        `);
        return { status: "ok" };
    })
    .delete('/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE article_id = ${id}`);
        await db.run(sql`DELETE FROM article_word_index WHERE article_id = ${id}`);
        await db.run(sql`DELETE FROM articles WHERE id = ${id}`);
        return { status: "ok" };
    });
