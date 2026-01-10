import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

import { AppError } from '../src/errors/AppError';

interface ProfileBody {
    name: string;
    topicPreference?: string;
    concurrency?: number | string;
    timeoutMs?: number | string;
}

/**
 * Profile Routes (生成配置管理)
 * 
 * 职责：
 * 管理 LLM 生成任务的参数模板 (Profiles)。
 * 包含了 Topic Preference (偏好主题), Concurrency (并发限制), Timeout 等运行时配置。
 * 
 * 安全性注意：
 * 删除 Profile 时是一个高危操作，会级联删除所有使用该 Profile 生成的任务及文章历史。
 * 必须小心处理事务一致性（目前通过手动顺序 DELETE 模拟）。
 */
export const profilesRoutes = new Elysia({ prefix: '/api/profiles' })
    .get('/', async () => {
        return await db.all(sql`SELECT * FROM generation_profiles ORDER BY updated_at DESC`);
    })
    .get('/:id', async ({ params: { id } }) => {
        const res = await db.all(sql`SELECT * FROM generation_profiles WHERE id = ${id} LIMIT 1`);
        if (res.length === 0) throw AppError.notFound();
        return res[0];
    })
    .post('/', async ({ body }) => {
        const b = body as ProfileBody;
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await db.run(sql`
            INSERT INTO generation_profiles (id, name, topic_preference, concurrency, timeout_ms, created_at, updated_at)
            VALUES (${id}, ${b.name}, ${b.topicPreference || ""}, ${Number(b.concurrency) || 1}, ${Number(b.timeoutMs) || 60000}, ${now}, ${now})
        `);
        return { status: "ok", id };
    })
    .put('/:id', async ({ params: { id }, body }) => {
        const b = body as ProfileBody;
        await db.run(sql`
            UPDATE generation_profiles 
            SET name = ${b.name}, 
                topic_preference = ${b.topicPreference}, 
                concurrency = ${Number(b.concurrency)}, 
                timeout_ms = ${Number(b.timeoutMs)}, 
                updated_at = ${new Date().toISOString()}
            WHERE id = ${id}
        `);
        return { status: "ok" };
    })
    .delete('/:id', async ({ params: { id } }) => {
        const profileTasks = await db.all(sql`SELECT id FROM tasks WHERE profile_id = ${id}`);
        const taskIds = (profileTasks as { id: string }[]).map((t) => t.id);

        if (taskIds.length > 0) {
            const inClause = taskIds.map(tid => `'${tid}'`).join(',');

            await db.run(sql.raw(`
                DELETE FROM highlights 
                WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id IN (${inClause}))
            `));

            await db.run(sql.raw(`
                DELETE FROM article_word_index 
                WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id IN (${inClause}))
            `));

            await db.run(sql.raw(`DELETE FROM articles WHERE generation_task_id IN (${inClause})`));
            await db.run(sql.raw(`DELETE FROM tasks WHERE id IN (${inClause})`));
        }

        await db.run(sql`DELETE FROM generation_profiles WHERE id = ${id}`);
        return { status: "ok" };
    });
