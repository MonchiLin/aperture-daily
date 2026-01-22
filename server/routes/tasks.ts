import { Elysia } from 'elysia';
import { db } from '../src/db/factory';
import { TaskQueue } from '../src/services/tasks/queue';
import { getBusinessDate } from '../src/lib/time';
import { toCamelCase } from '../src/utils/casing';

import { AppError } from '../src/errors/AppError';

interface GenerateBody { task_date?: string; date?: string; llm?: string; mode?: 'rss' | 'impression'; }

export const tasksRoutes = (queue: TaskQueue) => new Elysia({ prefix: '/api' })
    .post('/generate', async ({ body }) => {
        const b = body as GenerateBody;
        console.log("收到生成请求:", b);
        const date = b.task_date || b.date || getBusinessDate();

        const tasks = await queue.enqueue(date, 'manual', b.llm, b.mode);
        return { status: "ok", tasks: toCamelCase(tasks) };
    })
    .get('/tasks', async ({ query: { task_date } }) => {
        if (!task_date) throw AppError.badRequest("Missing task_date");

        // JOIN profile 表获取 profile 名称，便于前端展示任务所属配置
        const results = await db.selectFrom('tasks')
            .leftJoin('generation_profiles', 'tasks.profile_id', 'generation_profiles.id')
            .selectAll('tasks')
            .select('generation_profiles.name as profile_name')
            .where('tasks.task_date', '=', task_date)
            .orderBy('tasks.created_at', 'desc')
            .execute();

        return { tasks: toCamelCase(results) };
    })
    .get('/tasks/:id', async ({ params: { id } }) => {
        const result = await db.selectFrom('tasks')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst();

        if (!result) throw AppError.notFound();
        return toCamelCase(result);
    })
    .delete('/tasks/:id', async ({ params: { id } }) => {
        // Cascading Delete via Kysely Subqueries

        // 1. Highlights
        await db.deleteFrom('highlights')
            .where('article_id', 'in',
                db.selectFrom('articles').select('id').where('generation_task_id', '=', id)
            )
            .execute();

        // 2. Article Word Index
        await db.deleteFrom('article_word_index')
            .where('article_id', 'in',
                db.selectFrom('articles').select('id').where('generation_task_id', '=', id)
            )
            .execute();

        // 3. Variants & Vocab
        await db.deleteFrom('article_variants')
            .where('article_id', 'in',
                db.selectFrom('articles').select('id').where('generation_task_id', '=', id)
            )
            .execute();

        await db.deleteFrom('article_vocabulary')
            .where('article_id', 'in',
                db.selectFrom('articles').select('id').where('generation_task_id', '=', id)
            )
            .execute();

        // 4. Articles
        await db.deleteFrom('articles')
            .where('generation_task_id', '=', id)
            .execute();

        // 5. Task
        await db.deleteFrom('tasks')
            .where('id', '=', id)
            .execute();

        return { status: "ok" };
    });
