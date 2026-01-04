import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

export const articlesRoutes = new Elysia({ prefix: '/api/articles' })
    .get('/:id', async ({ params: { id } }) => {
        try {
            const articleRows = await db.all(sql`SELECT * FROM articles WHERE id = ${id} LIMIT 1`) as Array<{ generation_task_id: string }>;
            if (articleRows.length === 0) return { error: "Not found", status: 404 };
            const article = articleRows[0]!;

            const taskRows = await db.all(sql`SELECT * FROM tasks WHERE id = ${article.generation_task_id} LIMIT 1`);
            const task = taskRows.length > 0 ? taskRows[0] : null;

            return { articles: article, tasks: task };
        } catch (e) {
            return { status: "error", message: e instanceof Error ? e.message : 'Unknown error' };
        }
    })
    .delete('/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE article_id = ${id}`);
        await db.run(sql`DELETE FROM article_word_index WHERE article_id = ${id}`);
        await db.run(sql`DELETE FROM articles WHERE id = ${id}`);
        return { status: "ok" };
    });
