import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

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
        return await db.all(sql`SELECT * FROM highlights WHERE article_id = ${id}`);
    })
    .post('/highlights', async ({ body, set }) => {
        try {
            const b = body as HighlightBody;
            const id = b.id || crypto.randomUUID();
            await db.run(sql`
                INSERT INTO highlights (id, article_id, actor, start_meta_json, end_meta_json, text, note, style_json, created_at, updated_at)
                VALUES (${id}, ${b.articleId}, ${b.actor || 'user'}, ${JSON.stringify(b.startMeta)}, ${JSON.stringify(b.endMeta)}, ${b.text}, ${b.note}, ${b.style ? JSON.stringify(b.style) : null}, ${new Date().toISOString()}, ${new Date().toISOString()})
            `);
            return { status: "ok", id };
        } catch (e) {
            console.error(e);
            set.status = 500;
            return { error: e instanceof Error ? e.message : 'Unknown error' };
        }
    })
    .put('/highlights/:id', async ({ params: { id }, body, set }) => {
        try {
            const b = body as HighlightUpdateBody;
            await db.run(sql`UPDATE highlights SET note = ${b.note}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`);
            return { status: "ok" };
        } catch (e) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : 'Unknown error' };
        }
    })
    .delete('/highlights/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE id = ${id}`);
        return { status: "ok" };
    });
