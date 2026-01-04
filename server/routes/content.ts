import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

interface TaskRow { id: string; task_date: string; }
interface DailyWordsRow { new_words_json: string; review_words_json: string; }

// ... imports ...

export const contentRoutes = new Elysia({ prefix: '/api' })
    .get('/days', async () => {
        const start = performance.now();
        console.log(`[API-PERF] /api/days: start`);
        const result = await db.all(sql`SELECT DISTINCT task_date FROM tasks WHERE status = 'succeeded' ORDER BY task_date DESC`);
        console.log(`[API-PERF] /api/days: ${(performance.now() - start).toFixed(2)}ms`);
        return { days: (result as TaskRow[]).map((r) => r.task_date) };
    })
    .get('/day/:date', async ({ params: { date } }) => {
        const start = performance.now();
        console.log(`[API-PERF] /api/day/${date}: start`);

        const taskQueryStart = performance.now();
        const taskRows = await db.all(sql`
            SELECT * FROM tasks 
            WHERE task_date = ${date} AND type = 'article_generation' 
            ORDER BY finished_at
        `);
        console.log(`[API-PERF] /api/day/${date}: task query ${(performance.now() - taskQueryStart).toFixed(2)}ms`);

        const taskIds = (taskRows as TaskRow[]).map((t) => t.id);
        let articles: unknown[] = [];

        if (taskIds.length > 0) {
            const articleQueryStart = performance.now();
            const sqlQuery = `SELECT * FROM articles WHERE generation_task_id IN (${taskIds.map(id => `'${id}'`).join(',')}) ORDER BY created_at ASC`;
            articles = await db.all(sql.raw(sqlQuery));
            console.log(`[API-PERF] /api/day/${date}: articles query ${(performance.now() - articleQueryStart).toFixed(2)}ms (${articles.length} articles)`);
        }

        console.log(`[API-PERF] /api/day/${date}: total ${(performance.now() - start).toFixed(2)}ms`);
        return { articles };
    })
    .get('/day/:date/words', async ({ params: { date }, set }) => {
        const start = performance.now();
        console.log(`[API-PERF] /api/day/${date}/words: start`);

        const rows = await db.all(sql`SELECT * FROM daily_words WHERE date = ${date} LIMIT 1`);
        const row = rows[0] as DailyWordsRow | undefined;
        if (!row) {
            console.log(`[API-PERF] /api/day/${date}/words: ${(performance.now() - start).toFixed(2)}ms (no data)`);
            return { date, words: [], word_count: 0 };
        }

        const newWords = JSON.parse(row.new_words_json);
        const reviewWords = JSON.parse(row.review_words_json);
        const newList = Array.isArray(newWords) ? newWords : [];
        const reviewList = Array.isArray(reviewWords) ? reviewWords : [];

        set.headers['Cache-Control'] = 'public, s-maxage=31536000, immutable';

        console.log(`[API-PERF] /api/day/${date}/words: ${(performance.now() - start).toFixed(2)}ms (${newList.length} new, ${reviewList.length} review)`);
        return {
            date,
            new_words: newList,
            review_words: reviewList,
            new_count: newList.length,
            review_count: reviewList.length,
            word_count: newList.length + reviewList.length
        };
    });
