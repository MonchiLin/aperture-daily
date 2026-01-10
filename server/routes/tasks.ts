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
        console.log("收到生成请求:", b);
        // 如果未指定日期，使用当前的“业务日期”(北京时间今日)
        // 这确保了哪怕在深夜 UTC+0 的容器中运行，只要是北京时间 10.1 了，就会生成 10.1 的任务。
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
        // 级联删除 (Cascading Delete)
        // 
        // 我们的 SQLite 表没有设置 ON DELETE CASCADE 外键约束（因为部分逻辑较软性）。
        // 因此必须手动按顺序清理：
        // 1. Highlights (依赖 Article ID)
        // 2. Article Word Index (依赖 Article ID)
        // 3. Articles (依赖 Task ID)
        // 4. Task (Root)
        // 
        // 顺序颠倒会导致外键约束错误（如果未来开启了约束的话）。
        await db.run(sql`DELETE FROM highlights WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})`);
        await db.run(sql`DELETE FROM article_word_index WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})`);
        await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${id}`);
        await db.run(sql`DELETE FROM tasks WHERE id = ${id}`);
        return { status: "ok" };
    });
