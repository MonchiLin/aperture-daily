import { Elysia } from 'elysia';
import { db } from '../src/db/factory';
import { env } from '../config/env';

export const healthRoutes = new Elysia()
    .get('/', () => {
        const buildTime = env.BUILD_TIME === 'Dev'
            ? 'Dev'
            : new Date(env.BUILD_TIME).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
        return `Hello Elysia from UpWord backend! (Build: ${buildTime})`;
    })
    .get('/health', () => ({ status: "ok", timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }))
    .get('/db-check', async () => {
        const result = await db.selectFrom('tasks').limit(1).execute();
        return { status: "connected", result };
    });
