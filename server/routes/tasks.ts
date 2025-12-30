import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { TaskQueue } from '../src/services/tasks/TaskQueue';
import { getBusinessDate } from '../src/lib/time';

export const tasksRoutes = (queue: TaskQueue) => new Elysia({ prefix: '/api' })
    .post('/generate', async ({ body }: { body: any }) => {
        console.log("Receive generation request:", body);
        const date = body.task_date || body.date || getBusinessDate();

        try {
            const tasks = await queue.enqueue(date, 'manual');
            return { status: "ok", tasks };
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    })
    .get('/tasks', async ({ query: { task_date } }) => {
        console.log(`[GET /api/tasks] Request for date: ${task_date}`);
        try {
            if (!task_date) return { error: "Missing task_date", status: 400 };
            const results = await db.all(sql`SELECT * FROM tasks WHERE task_date = ${task_date} ORDER BY created_at DESC`);
            console.log(`[GET /api/tasks] Found ${results.length} tasks`);
            return { tasks: results };
        } catch (e: any) {
            console.error(`[GET /api/tasks] Error:`, e);
            return { status: "error", message: e.message, stack: e.stack };
        }
    })
    .get('/tasks/:id', async ({ params: { id } }) => {
        const result = await db.all(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
        if (result.length === 0) return { error: "Not found", status: 404 };
        return result[0];
    })
    .delete('/tasks/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})`);
        await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${id}`);
        await db.run(sql`DELETE FROM tasks WHERE id = ${id}`);
        return { status: "ok" };
    });
