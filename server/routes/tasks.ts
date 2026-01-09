import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { TaskQueue } from '../src/services/tasks/queue';
import { getBusinessDate } from '../src/lib/time';

import { AppError } from '../src/errors/AppError';

interface GenerateBody { task_date?: string; date?: string; llm?: string; }

export const tasksRoutes = (queue: TaskQueue) => new Elysia({ prefix: '/api' })
    .post('/generate', async ({ body }) => {
        const b = body as GenerateBody;
        console.log("Receive generation request:", b);
        const date = b.task_date || b.date || getBusinessDate();

        const tasks = await queue.enqueue(date, 'manual', b.llm);
        return { status: "ok", tasks };
    })
    .get('/tasks', async ({ query: { task_date } }) => {
        if (!task_date) throw AppError.badRequest("Missing task_date");

        const results = await db.all(sql`SELECT * FROM tasks WHERE task_date = ${task_date} ORDER BY created_at DESC`);
        return { tasks: results };
    })
    .get('/tasks/:id', async ({ params: { id } }) => {
        const result = await db.all(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
        if (result.length === 0) throw AppError.notFound();
        return result[0];
    })
    .delete('/tasks/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})`);
        await db.run(sql`DELETE FROM article_word_index WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})`);
        await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${id}`);
        await db.run(sql`DELETE FROM tasks WHERE id = ${id}`);
        return { status: "ok" };
    });
