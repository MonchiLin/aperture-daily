import { Elysia } from 'elysia';
import { db } from '../src/db/factory';
import { toCamelCase } from '../src/utils/casing';

interface HighlightBody {
    id?: string;
    articleId: string;
    actor?: string;
    startMeta: unknown;
    endMeta: unknown;
    text: string;
    note?: string;
    style?: unknown;
}

interface HighlightUpdateBody {
    note?: string;
}

export const highlightsRoutes = new Elysia({ prefix: '/api' })
    .get('/articles/:id/highlights', async ({ params: { id } }) => {
        const res = await db.selectFrom('highlights')
            .selectAll()
            .where('article_id', '=', id)
            .execute();
        return toCamelCase(res);
    })
    .post('/highlights', async ({ body }) => {
        const b = body as HighlightBody;
        const id = b.id || crypto.randomUUID();
        const now = new Date().toISOString();

        await db.insertInto('highlights')
            .values({
                id,
                article_id: b.articleId,
                actor: b.actor || 'user',
                start_meta_json: JSON.stringify(b.startMeta),
                end_meta_json: JSON.stringify(b.endMeta),
                text: b.text,
                note: b.note,
                style_json: b.style ? JSON.stringify(b.style) : null,
                created_at: now,
                updated_at: now
            })
            .execute();

        return { status: "ok", id };
    })
    .put('/highlights/:id', async ({ params: { id }, body }) => {
        const b = body as HighlightUpdateBody;
        await db.updateTable('highlights')
            .set({
                note: b.note,
                updated_at: new Date().toISOString()
            })
            .where('id', '=', id)
            .execute();

        return { status: "ok" };
    })
    .delete('/highlights/:id', async ({ params: { id } }) => {
        await db.deleteFrom('highlights').where('id', '=', id).execute();
        return { status: "ok" };
    });
