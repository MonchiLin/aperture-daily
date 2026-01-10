import { Elysia } from 'elysia';
import { db } from '../src/db/factory';
import { sql } from 'kysely';
import { toCamelCase } from '../src/utils/casing';

export const contentRoutes = new Elysia({ prefix: '/api' })
    .get('/days', async () => {
        const result = await db.selectFrom('tasks')
            .select('task_date')
            .distinct()
            .where('status', '=', 'succeeded')
            .orderBy('task_date', 'desc')
            .execute();

        return { days: result.map((r) => r.task_date) };
    })
    .get('/day/:date', async ({ params: { date } }) => {
        const taskRows = await db.selectFrom('tasks')
            .selectAll()
            .where('task_date', '=', date)
            .where('type', '=', 'article_generation')
            .orderBy('finished_at', 'asc')
            .execute();

        const taskIds = taskRows.map((t) => t.id);
        let articles: unknown[] = [];

        if (taskIds.length > 0) {
            articles = await db.selectFrom('articles')
                .selectAll()
                .where('generation_task_id', 'in', taskIds)
                .orderBy('created_at', 'asc')
                .execute();
        }

        return { articles: toCamelCase(articles) };
    })

    .get('/day/:date/words', async ({ params: { date }, set }) => {
        const refs = await db.selectFrom('daily_word_references')
            .select(['word', 'type'])
            .where('date', '=', date)
            .execute();

        if (refs.length === 0) {
            return { date, words: [], word_count: 0 };
        }

        const newList = refs.filter(r => r.type === 'new').map(r => r.word);
        const reviewList = refs.filter(r => r.type === 'review').map(r => r.word);

        set.headers['Cache-Control'] = 'public, s-maxage=31536000, immutable';

        return {
            date,
            new_words: newList,
            review_words: reviewList,
            new_count: newList.length,
            review_count: reviewList.length,
            word_count: newList.length + reviewList.length
        };
    });
