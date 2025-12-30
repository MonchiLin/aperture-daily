import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

export const contentRoutes = new Elysia({ prefix: '/api' })
    .get('/days', async () => {
        try {
            const result = await db.all(sql`SELECT DISTINCT task_date FROM tasks WHERE status = 'succeeded' ORDER BY task_date DESC`);
            return { days: result.map((r: any) => r.task_date) };
        } catch (e: any) {
            console.error("API Error /api/days:", e);
            return { error: e.message };
        }
    })
    .get('/day/:date', async ({ params: { date } }) => {
        try {
            const taskRows = await db.all(sql`
                SELECT * FROM tasks 
                WHERE task_date = ${date} AND type = 'article_generation' 
                ORDER BY finished_at
            `);

            const taskIds = taskRows.map((t: any) => t.id);
            let articleRows: any[] = [];

            if (taskIds.length > 0) {
                const sqlQuery = `SELECT * FROM articles WHERE generation_task_id IN (${taskIds.map(id => `'${id}'`).join(',')}) ORDER BY model`;
                articleRows = await db.all(sql.raw(sqlQuery));
            }

            const articlesByTaskId = articleRows.reduce((acc: any, article: any) => {
                const taskId = article.generation_task_id;
                if (!acc[taskId]) acc[taskId] = [];
                acc[taskId].push(article);
                return acc;
            }, {});

            const publishedTaskGroups = taskRows
                .map((task: any) => ({
                    task,
                    articles: articlesByTaskId[task.id] ?? []
                }))
                .filter((group: any) => group.articles.length > 0);

            return { publishedTaskGroups };
        } catch (e: any) {
            console.error(`[GET /api/day/${date}] Error:`, e);
            return { status: "error", message: e.message };
        }
    })
    .get('/day/:date/words', async ({ params: { date } }) => {
        try {
            const rows = await db.all(sql`SELECT * FROM daily_words WHERE date = ${date} LIMIT 1`);
            const row: any = rows[0];
            if (!row) {
                return { date, words: [], word_count: 0 };
            }

            const newWords = JSON.parse(row.new_words_json);
            const reviewWords = JSON.parse(row.review_words_json);
            const newList = Array.isArray(newWords) ? newWords : [];
            const reviewList = Array.isArray(reviewWords) ? reviewWords : [];
            return {
                date,
                new_words: newList,
                review_words: reviewList,
                new_count: newList.length,
                review_count: reviewList.length,
                word_count: newList.length + reviewList.length
            };
        } catch (e: any) {
            console.error(`[GET /api/day/${date}/words] Error:`, e);
            return { status: "error", message: e.message };
        }
    });
