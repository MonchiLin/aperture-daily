import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

export const profilesRoutes = new Elysia({ prefix: '/api/profiles' })
    .get('/', async () => {
        return await db.all(sql`SELECT * FROM generation_profiles ORDER BY updated_at DESC`);
    })
    .get('/:id', async ({ params: { id }, error }) => {
        const res = await db.all(sql`SELECT * FROM generation_profiles WHERE id = ${id} LIMIT 1`);
        if (res.length === 0) return error(404, "Not found");
        return res[0];
    })
    .post('/', async ({ body, error }: any) => {
        try {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            await db.run(sql`
                INSERT INTO generation_profiles (id, name, topic_preference, concurrency, timeout_ms, created_at, updated_at)
                VALUES (${id}, ${body.name}, ${body.topicPreference || ""}, ${Number(body.concurrency) || 1}, ${Number(body.timeoutMs) || 60000}, ${now}, ${now})
            `);
            return { status: "ok", id };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .put('/:id', async ({ params: { id }, body, error }: any) => {
        try {
            await db.run(sql`
                UPDATE generation_profiles 
                SET name = ${body.name}, 
                    topic_preference = ${body.topicPreference}, 
                    concurrency = ${Number(body.concurrency)}, 
                    timeout_ms = ${Number(body.timeoutMs)}, 
                    updated_at = ${new Date().toISOString()}
                WHERE id = ${id}
            `);
            return { status: "ok" };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .delete('/:id', async ({ params: { id } }) => {
        const profileTasks = await db.all(sql`SELECT id FROM tasks WHERE profile_id = ${id}`);
        const taskIds = profileTasks.map((t: any) => t.id);

        if (taskIds.length > 0) {
            const inClause = taskIds.map(tid => `'${tid}'`).join(',');

            await db.run(sql.raw(`
                DELETE FROM highlights 
                WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id IN (${inClause}))
            `));

            await db.run(sql.raw(`DELETE FROM articles WHERE generation_task_id IN (${inClause})`));
            await db.run(sql.raw(`DELETE FROM tasks WHERE id IN (${inClause})`));
        }

        await db.run(sql`DELETE FROM generation_profiles WHERE id = ${id}`);
        return { status: "ok" };
    });
