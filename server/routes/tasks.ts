import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { TaskQueue } from '../src/services/tasks/TaskQueue';
import { getBusinessDate } from '../src/lib/time';

interface GenerateBody { task_date?: string; date?: string; }

export const tasksRoutes = (queue: TaskQueue) => new Elysia({ prefix: '/api' })
    .post('/generate', async ({ body }) => {
        const b = body as GenerateBody;
        console.log("Receive generation request:", b);
        const date = b.task_date || b.date || getBusinessDate();

        try {
            const tasks = await queue.enqueue(date, 'manual');
            return { status: "ok", tasks };
        } catch (e) {
            return { status: "error", message: e instanceof Error ? e.message : 'Unknown error' };
        }
    })
    .get('/tasks', async ({ query: { task_date } }) => {
        console.log(`[GET /api/tasks] Request for date: ${task_date}`);
        try {
            if (!task_date) return { error: "Missing task_date", status: 400 };
            const results = await db.all(sql`SELECT * FROM tasks WHERE task_date = ${task_date} ORDER BY created_at DESC`);
            console.log(`[GET /api/tasks] Found ${results.length} tasks`);
            return { tasks: results };
        } catch (e) {
            console.error(`[GET /api/tasks] Error:`, e);
            const err = e instanceof Error ? e : { message: 'Unknown error', stack: '' };
            return { status: "error", message: err.message, stack: err.stack };
        }
    })
    .get('/tasks/:id', async ({ params: { id } }) => {
        const result = await db.all(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
        if (result.length === 0) return { error: "Not found", status: 404 };
        return result[0];
    })
    .delete('/tasks/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})`);
        await db.run(sql`DELETE FROM article_word_index WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})`);
        await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${id}`);
        await db.run(sql`DELETE FROM tasks WHERE id = ${id}`);
        return { status: "ok" };
    });
