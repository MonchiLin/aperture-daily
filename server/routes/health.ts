import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import * as schema from '../db/schema';
import { env } from '../config/env';

export const healthRoutes = new Elysia()
    .get('/', () => `Hello Elysia from Aperture Daily backend! (Build: ${env.BUILD_TIME})`)
    .get('/health', () => ({ status: "ok", timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }))
    .get('/db-check', async () => {
        const result = await db.select().from(schema.tasks).limit(1);
        return { status: "connected", result };
    });
