import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import * as schema from '../db/schema';
import { sql } from 'drizzle-orm';
import { env } from '../config/env';

export const healthRoutes = new Elysia()
    .get('/', () => `Hello Elysia from dancix backend! (Build: ${env.BUILD_TIME})`)
    .get('/health', () => ({ status: "ok", timestamp: new Date().toISOString() }))
    .get('/db-check', async () => {
        try {
            const result = await db.select({ count: schema.tasks.id }).from(schema.tasks).limit(1);
            return { status: "connected", result };
        } catch (e: any) {
            return { status: "error", error: e.message };
        }
    });
