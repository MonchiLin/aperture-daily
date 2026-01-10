import { Elysia, t } from 'elysia';
import { db } from '../src/db/factory';

interface MemoryEntry {
    snippet: string;
    articleTitle: string;
    articleId: string;
    articleSlug?: string;
    date: string;
    timeAgo: string;
}

export const echoesRoutes = new Elysia({ prefix: '/api/echoes' })
    .post('/batch', async ({ body }: { body: { words?: string[], article_id?: string, exclude_article_id?: string } }) => {
        const { words, article_id, exclude_article_id } = body;

        let targets: string[] = [];

        // 1. Resolve words
        if (article_id) {
            const vocabRows = await db.selectFrom('article_vocabulary')
                .select('word')
                .where('article_id', '=', article_id)
                .execute();
            targets = vocabRows.map(r => r.word.toLowerCase());
        } else if (words && words.length > 0) {
            targets = words.map(w => w.trim().toLowerCase()).filter(w => w.length > 1);
        }

        if (targets.length === 0) return { echoes: {} };

        const excludeId = exclude_article_id || article_id;

        console.log(`[Echoes Batch] Checking ${targets.length} words. Exclude: ${excludeId}`);

        // 2. Batch Query
        let query = db.selectFrom('article_word_index')
            .innerJoin('articles', 'article_word_index.article_id', 'articles.id')
            .leftJoin('tasks', 'articles.generation_task_id', 'tasks.id')
            .select([
                'article_word_index.word',
                'article_word_index.context_snippet',
                'article_word_index.created_at',
                'articles.id as article_id',
                'articles.title',
                'articles.slug',
                'tasks.task_date'
            ])
            .where('article_word_index.word', 'in', targets)
            .orderBy('article_word_index.created_at', 'desc')
            .limit(150);

        if (excludeId) {
            query = query.where('article_word_index.article_id', '!=', excludeId);
        }

        const results = await query.execute();

        const echoes: Record<string, MemoryEntry[]> = {};

        for (const row of results) {
            // Note: Kysely returns typed rows here.

            if (!echoes[row.word]) echoes[row.word] = [];

            if ((echoes[row.word]?.length || 0) >= 10) continue;

            echoes[row.word]?.push({
                snippet: row.context_snippet,
                articleTitle: row.title,
                articleId: row.article_id,
                articleSlug: row.slug || undefined,
                date: row.task_date || '', // task_date from left join might be null? Schema says not null but joins...
                timeAgo: row.created_at
            });
        }

        console.log(`[Echoes Batch] Found echoes for ${Object.keys(echoes).length} words.`);
        return { echoes };
    }, {
        body: t.Object({
            words: t.Optional(t.Array(t.String())),
            article_id: t.Optional(t.String()),
            exclude_article_id: t.Optional(t.String())
        })
    });
