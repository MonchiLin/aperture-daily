
import { Elysia } from 'elysia';
import { db } from '../src/db/factory';
import { AppError } from '../src/errors/AppError';
import { toCamelCase } from '../src/utils/casing';
import { sql } from 'kysely';

interface ProfileBody {
    name: string;
    topicIds?: string[]; // [New] Array of Topic IDs
}

export const profilesRoutes = new Elysia({ prefix: '/api/profiles' })
    .get('/', async () => {
        const profiles = await db.selectFrom('generation_profiles')
            .selectAll()
            .orderBy('updated_at', 'desc')
            .execute();

        // Enrich with topics
        const result = await Promise.all(profiles.map(async (p) => {
            const topics = await db.selectFrom('profile_topics')
                .innerJoin('topics', 'profile_topics.topic_id', 'topics.id')
                .select(['topics.id', 'topics.label'])
                .where('profile_topics.profile_id', '=', p.id)
                .execute();

            return {
                ...(toCamelCase(p) as object),
                topics: topics.map(t => ({ id: t.id, label: t.label })),
                // Legacy compatibility: Construct string from labels
                topicPreference: topics.map(t => t.label).join(', ')
            };
        }));

        return result;
    })
    .get('/:id', async ({ params: { id } }) => {
        const p = await db.selectFrom('generation_profiles')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst();

        if (!p) throw AppError.notFound();

        const topics = await db.selectFrom('profile_topics')
            .innerJoin('topics', 'profile_topics.topic_id', 'topics.id')
            .select(['topics.id', 'topics.label'])
            .where('profile_topics.profile_id', '=', id)
            .execute();

        return {
            ...(toCamelCase(p) as object),
            topics: topics.map(t => ({ id: t.id, label: t.label })),
            topicIds: topics.map(t => t.id),
            topicPreference: topics.map(t => t.label).join(', ')
        };
    })
    .post('/', async ({ body }) => {
        const b = body as ProfileBody;
        const id = crypto.randomUUID();

        // Helper to sync topics
        async function syncTopics(profileId: string, topicIds: string[]) {
            if (!topicIds || topicIds.length === 0) return;

            // Validate topics exist (Optional, but good practice)
            // Insert
            const values = topicIds.map(tid => ({
                profile_id: profileId,
                topic_id: tid
            }));

            await db.insertInto('profile_topics')
                .values(values)
                .onConflict(oc => oc.doNothing())
                .execute();
        }

        await db.insertInto('generation_profiles')
            .values({
                id: id,
                name: b.name
            })
            .execute();

        if (b.topicIds) {
            await syncTopics(id, b.topicIds);
        }

        return { status: "ok", id };
    })
    .put('/:id', async ({ params: { id }, body }) => {
        const b = body as ProfileBody;

        await db.updateTable('generation_profiles')
            .set({
                name: b.name,
                updated_at: new Date().toISOString()
            })
            .where('id', '=', id)
            .execute();

        // Sync Topics
        if (b.topicIds) {
            // Transaction-like: Delete all, then insert
            await db.deleteFrom('profile_topics')
                .where('profile_id', '=', id)
                .execute();

            if (b.topicIds.length > 0) {
                const values = b.topicIds.map(tid => ({
                    profile_id: id,
                    topic_id: tid
                }));
                await db.insertInto('profile_topics').values(values).execute();
            }
        }

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

        // Delete profile associations
        await db.deleteFrom('profile_topics').where('profile_id', '=', id).execute();
        await db.deleteFrom('generation_profiles').where('id', '=', id).execute();

        return { status: "ok" };
    });
