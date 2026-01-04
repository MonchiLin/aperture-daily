import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import * as schema from '../db/schema';
import { env } from '../config/env';

export const healthRoutes = new Elysia()
    .get('/', () => `Hello Elysia from Aperture Daily backend! (Build: ${env.BUILD_TIME})`)
    .get('/health', () => ({ status: "ok", timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }))
    .get('/db-check', async () => {
        try {
            const result = await db.select({ count: schema.tasks.id }).from(schema.tasks).limit(1);
            return { status: "connected", result };
        } catch (e) {
            return { status: "error", error: e instanceof Error ? e.message : 'Unknown error' };
        }
    });
