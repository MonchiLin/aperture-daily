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

// ... interfaces ...

export const highlightsRoutes = new Elysia({ prefix: '/api' })
    .get('/articles/:id/highlights', async ({ params: { id } }) => {
        return await db.all(sql`SELECT * FROM highlights WHERE article_id = ${id}`);
    })
    .post('/highlights', async ({ body }) => {
        const b = body as HighlightBody;
        const id = b.id || crypto.randomUUID();
        await db.run(sql`
            INSERT INTO highlights (id, article_id, actor, start_meta_json, end_meta_json, text, note, style_json, created_at, updated_at)
            VALUES (${id}, ${b.articleId}, ${b.actor || 'user'}, ${JSON.stringify(b.startMeta)}, ${JSON.stringify(b.endMeta)}, ${b.text}, ${b.note}, ${b.style ? JSON.stringify(b.style) : null}, ${new Date().toISOString()}, ${new Date().toISOString()})
        `);
        return { status: "ok", id };
    })
    .put('/highlights/:id', async ({ params: { id }, body }) => {
        const b = body as HighlightUpdateBody;
        await db.run(sql`UPDATE highlights SET note = ${b.note}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`);
        return { status: "ok" };
    })
    .delete('/highlights/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE id = ${id}`);
        return { status: "ok" };
    });
