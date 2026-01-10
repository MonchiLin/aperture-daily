import { Elysia } from 'elysia';
import { sql } from 'kysely';
import { db } from '../src/db/factory';
import { toCamelCase } from '../src/utils/casing';

import { AppError } from '../src/errors/AppError';

export const articlesRoutes = new Elysia({ prefix: '/api/articles' })
    .get('/lookup', async ({ query: { date, slug } }) => {
        if (!date || !slug) throw AppError.badRequest('Missing date or slug');

        const articleRow = await db.selectFrom('articles')
            .innerJoin('tasks', 'articles.generation_task_id', 'tasks.id')
            .select('articles.id')
            .where('tasks.task_date', '=', date)
            .where('articles.slug', '=', slug)
            .limit(1)
            .executeTakeFirst();

        if (!articleRow) throw AppError.notFound();
        return getArticleDetails(articleRow.id);
    })
    .get('/:id', async ({ params: { id } }) => {
        return getArticleDetails(id);
    })
    .patch('/:id/read', async ({ params: { id }, body }) => {
        const { level } = body as { level: number };
        if (level === undefined) return { status: "error", message: "level required" };

        const mask = (1 << level) - 1;

        await db.updateTable('articles')
            .set({
                read_levels: sql`read_levels | ${mask}`
            })
            .where('id', '=', id)
            .execute();

        return { status: "ok" };
    })
    .delete('/:id', async ({ params: { id } }) => {
        await db.deleteFrom('highlights').where('article_id', '=', id).execute();
        await db.deleteFrom('article_word_index').where('article_id', '=', id).execute();
        await db.deleteFrom('article_variants').where('article_id', '=', id).execute();
        await db.deleteFrom('article_vocabulary').where('article_id', '=', id).execute();

        await db.deleteFrom('articles').where('id', '=', id).execute();
        return { status: "ok" };
    });

// Helper
async function getArticleDetails(id: string) {
    const article = await db.selectFrom('articles')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

    if (!article) throw AppError.notFound();

    let task = null;
    if (article.generation_task_id) {
        task = await db.selectFrom('tasks')
            .leftJoin('generation_profiles', 'tasks.profile_id', 'generation_profiles.id')
            .selectAll('tasks')
            .select('generation_profiles.name as profileName')
            .where('tasks.id', '=', article.generation_task_id)
            .executeTakeFirst();
    }

    const variants = await db.selectFrom('article_variants')
        .select(['level', 'level_label', 'title', 'content', 'syntax_json', 'sentences_json'])
        .where('article_id', '=', id)
        .orderBy('level', 'asc')
        .execute();

    const vocabRows = await db.selectFrom('article_vocabulary')
        .leftJoin('article_vocab_definitions', 'article_vocabulary.id', 'article_vocab_definitions.vocab_id')
        .select([
            'article_vocabulary.id as vocab_id',
            'article_vocabulary.word',
            'article_vocabulary.phonetic',
            'article_vocab_definitions.part_of_speech',
            'article_vocab_definitions.definition'
        ])
        .where('article_vocabulary.article_id', '=', id)
        .execute();

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

    let content_json_reconstructed = null;

    if (variants.length > 0) {
        const reconstructed = {
            result: {
                title: article.title,
                sources: article.source_url ? [article.source_url] : [],
                articles: variants.map(v => ({
                    level: v.level,
                    level_label: v.level_label,
                    title: v.title,
                    content: v.content,
                    syntax: v.syntax_json || [],
                    sentences: v.sentences_json || []
                })),
                word_definitions: wordDefinitions
            }
        };
        content_json_reconstructed = JSON.stringify(toCamelCase(reconstructed));
    }

    // Mixin. toCamelCase on article row converts `generation_task_id` -> `generationTaskId`.
    // And `content_json` -> `contentJson` is NOT automatic because `article` doesn't have `content_json` column physically filled if we just fetched from DB and didn't join?
    // Wait, Drizzle had `content_json` virtual logic or real column?
    // Schema says `ArticlesTable` has NO `content_json`. It was constructed.
    // Drizzle code used to construct it manually.
    // So here I manually return `contentJson`.

    const camelArticle = toCamelCase(article) as Record<string, any>;

    // We append `contentJson` property.
    return {
        articles: {
            ...camelArticle,
            contentJson: content_json_reconstructed
        },
        tasks: toCamelCase(task)
    };
}
