
import { Elysia, t } from 'elysia';
import { db } from '../src/db/factory'; // Use the exported db instance
import { AppError } from '../src/errors/AppError';

// Schema
const createTopicSchema = t.Object({
    id: t.Optional(t.String()),
    label: t.String(),
    prompts: t.Optional(t.String()),
    is_active: t.Optional(t.Boolean())
});

const updateTopicSchema = t.Object({
    label: t.Optional(t.String()),
    prompts: t.Optional(t.String()),
    is_active: t.Optional(t.Boolean())
});

export const topicsRoutes = new Elysia({ prefix: '/api/topics' })
    // GET /api/topics - List all topics
    .get('/', async () => {
        const topics = await db.selectFrom('topics')
            .selectAll()
            .orderBy('created_at', 'desc')
            .execute();

        // Parse boolean for better DX
        return topics.map(t => ({
            ...t,
            is_active: Boolean(t.is_active)
        }));
    })

    // POST /api/topics - Create topic
    .post('/', async ({ body, set }) => {
        // Generate ID from label if not provided
        let id = body.id;
        if (!id) {
            id = body.label.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-');

            id = `${id}-${Math.floor(Math.random() * 1000)}`;
        }

        try {
            await db.insertInto('topics')
                .values({
                    id: id,
                    label: body.label,
                    prompts: body.prompts || `Search for news about ${body.label}.`,
                    is_active: body.is_active !== false ? 1 : 0
                })
                .execute();

            set.status = 201;
            return { success: true, id };
        } catch (e: any) {
            if (e.message?.includes('UNIQUE')) {
                throw new AppError(409, 'TOPIC_EXISTS', 'Topic ID or Label already exists');
            }
            throw e;
        }
    }, {
        body: createTopicSchema
    })

    // PUT /api/topics/:id - Update topic
    .put('/:id', async ({ params: { id }, body }) => {
        const updateData: any = {
            updated_at: new Date().toISOString()
        };
        if (body.label !== undefined) updateData.label = body.label;
        if (body.prompts !== undefined) updateData.prompts = body.prompts;
        if (body.is_active !== undefined) updateData.is_active = body.is_active ? 1 : 0;

        const result = await db.updateTable('topics')
            .set(updateData)
            .where('id', '=', id)
            .executeTakeFirst();

        if (result.numUpdatedRows === BigInt(0)) {
            throw new AppError(404, 'TOPIC_NOT_FOUND', 'Topic not found');
        }

        return { success: true };
    }, {
        body: updateTopicSchema
    })

    // DELETE /api/topics/:id - Delete topic
    .delete('/:id', async ({ params: { id } }) => {
        const result = await db.deleteFrom('topics')
            .where('id', '=', id)
            .executeTakeFirst();

        if (result.numDeletedRows === BigInt(0)) {
            throw new AppError(404, 'TOPIC_NOT_FOUND', 'Topic not found');
        }

        return { success: true };
    })

    /**
     * POST /api/topics/:id/sources
     * 将 RSS 源绑定到指定 Topic
     * 允许一个 Topic 拥有多个专用的 RSS 来源
     */
    .post('/:id/sources', async ({ params: { id }, body }) => {
        const { sourceId } = body as { sourceId: string };
        await db.insertInto('topic_sources')
            .values({
                topic_id: id,
                source_id: sourceId
            })
            // Ignore if already bound
            .onConflict((oc) => oc.doNothing())
            .execute();

        return { success: true };
    }, {
        body: t.Object({
            sourceId: t.String()
        })
    })

    /**
     * DELETE /api/topics/:id/sources/:sourceId
     * 解除 RSS 源与 Topic 的绑定
     * 注意：这不会删除 RSS 源本身，只会切断关联
     */
    .delete('/:id/sources/:sourceId', async ({ params: { id, sourceId } }) => {
        await db.deleteFrom('topic_sources')
            .where('topic_id', '=', id)
            .where('source_id', '=', sourceId)
            .execute();

        return { success: true };
    })

    // GET /api/topics/:id/sources - List bound sources
    .get('/:id/sources', async ({ params: { id } }) => {
        const sources = await db.selectFrom('news_sources as ns')
            .innerJoin('topic_sources as ts', 'ts.source_id', 'ns.id')
            .select(['ns.id', 'ns.name', 'ns.url', 'ns.is_active'])
            .where('ts.topic_id', '=', id)
            .execute();

        return sources.map(s => ({
            ...s,
            is_active: Boolean(s.is_active)
        }));
    });

