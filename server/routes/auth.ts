import { Elysia } from 'elysia';
import { env } from '../config/env';

export const authRoutes = new Elysia({ prefix: '/api/auth' })
    .post('/login', ({ body, error }: any) => {
        if (body?.key === env.ADMIN_KEY) return { status: "ok" };
        return error(401, { error: "Unauthorized" });
    })
    .get('/check', ({ request, error }: any) => {
        const key = request.headers.get ? request.headers.get('x-admin-key') : request.headers['x-admin-key'];
        if (key === env.ADMIN_KEY) return { status: "ok" };
        return error(401, { error: "Unauthorized" });
    });
