import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

export const highlightsRoutes = new Elysia({ prefix: '/api' })
    .get('/articles/:id/highlights', async ({ params: { id } }) => {
        return await db.all(sql`SELECT * FROM highlights WHERE article_id = ${id}`);
    })
    .post('/highlights', async ({ body, error }: any) => {
        try {
            const id = body.id || crypto.randomUUID();
            await db.run(sql`
                INSERT INTO highlights (id, article_id, actor, start_meta_json, end_meta_json, text, note, style_json, created_at, updated_at)
                VALUES (${id}, ${body.articleId}, ${body.actor || 'user'}, ${JSON.stringify(body.startMeta)}, ${JSON.stringify(body.endMeta)}, ${body.text}, ${body.note}, ${body.style ? JSON.stringify(body.style) : null}, ${new Date().toISOString()}, ${new Date().toISOString()})
            `);
            return { status: "ok", id };
        } catch (e: any) {
            console.error(e);
            return error(500, e.message);
        }
    })
    .put('/highlights/:id', async ({ params: { id }, body, error }: any) => {
        try {
            await db.run(sql`UPDATE highlights SET note = ${body.note}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`);
            return { status: "ok" };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .delete('/highlights/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE id = ${id}`);
        return { status: "ok" };
    });
