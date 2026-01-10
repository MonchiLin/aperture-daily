import { Elysia } from 'elysia';
import { db } from '../src/db/factory';
import { AppError } from '../src/errors/AppError';
import { toCamelCase } from '../src/utils/casing';

interface ProfileBody {
    name: string;
    topicPreference?: string;
    concurrency?: number | string;
    timeoutMs?: number | string;
}

export const profilesRoutes = new Elysia({ prefix: '/api/profiles' })
    .get('/', async () => {
        const res = await db.selectFrom('generation_profiles')
            .selectAll()
            .orderBy('updated_at', 'desc')
            .execute();
        return toCamelCase(res);
    })
    .get('/:id', async ({ params: { id } }) => {
        const res = await db.selectFrom('generation_profiles')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst();

        if (!res) throw AppError.notFound();
        return toCamelCase(res);
    })
    .post('/', async ({ body }) => {
        const b = body as ProfileBody;
        const id = crypto.randomUUID();

        await db.insertInto('generation_profiles')
            .values({
                id: id,
                name: b.name,
                topic_preference: b.topicPreference || "",
                concurrency: Number(b.concurrency) || 1,
                timeout_ms: Number(b.timeoutMs) || 60000
            })
            .execute();

        return { status: "ok", id };
    })
    .put('/:id', async ({ params: { id }, body }) => {
        const b = body as ProfileBody;
        await db.updateTable('generation_profiles')
            .set({
                name: b.name,
                topic_preference: b.topicPreference,
                concurrency: Number(b.concurrency),
                timeout_ms: Number(b.timeoutMs),
                updated_at: new Date().toISOString()
            })
            .where('id', '=', id)
            .execute();

        return { status: "ok" };
    })
    .delete('/:id', async ({ params: { id } }) => {
        // Cascade delete tasks and their children
        // 1. Get Tasks
        const taskIds = await db.selectFrom('tasks')
            .select('id')
            .where('profile_id', '=', id)
            .execute();

        const tIds = taskIds.map(t => t.id);

        if (tIds.length > 0) {
            // Highlights, Index
            const articleIdQuery = db.selectFrom('articles').select('id').where('generation_task_id', 'in', tIds);

            await db.deleteFrom('highlights').where('article_id', 'in', articleIdQuery).execute();
            await db.deleteFrom('article_word_index').where('article_id', 'in', articleIdQuery).execute();
            await db.deleteFrom('article_variants').where('article_id', 'in', articleIdQuery).execute();
            await db.deleteFrom('article_vocabulary').where('article_id', 'in', articleIdQuery).execute();

            await db.deleteFrom('articles').where('generation_task_id', 'in', tIds).execute();
            await db.deleteFrom('tasks').where('id', 'in', tIds).execute();
        }

        await db.deleteFrom('generation_profiles').where('id', '=', id).execute();
        return { status: "ok" };
    });
