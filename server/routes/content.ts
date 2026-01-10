import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

interface TaskRow { id: string; task_date: string; }
interface TaskRow { id: string; task_date: string; }

// ... imports ...

export const contentRoutes = new Elysia({ prefix: '/api' })
    .get('/days', async () => {
        const result = await db.all(sql`SELECT DISTINCT task_date FROM tasks WHERE status = 'succeeded' ORDER BY task_date DESC`);
        return { days: (result as TaskRow[]).map((r) => r.task_date) };
    })
    .get('/day/:date', async ({ params: { date } }) => {
        const taskRows = await db.all(sql`
            SELECT * FROM tasks 
            WHERE task_date = ${date} AND type = 'article_generation' 
            ORDER BY finished_at
        `);

        const taskIds = (taskRows as TaskRow[]).map((t) => t.id);
        let articles: unknown[] = [];

        if (taskIds.length > 0) {
            const sqlQuery = `SELECT * FROM articles WHERE generation_task_id IN (${taskIds.map(id => `'${id}'`).join(',')}) ORDER BY created_at ASC`;
            articles = await db.all(sql.raw(sqlQuery));
        }

        return { articles };
    })

    .get('/day/:date/words', async ({ params: { date }, set }) => {
        // 从规范化表读取
        const refs = await db.all(sql`
            SELECT word, type 
            FROM daily_word_references 
            WHERE date = ${date}
        `) as { word: string; type: 'new' | 'review' }[];

        if (refs.length === 0) {
            // 如果缺失，暂不需要回退到旧表 (假设已迁移)。
            // 返回空列表。
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
