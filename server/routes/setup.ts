import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';
import { env } from '../config/env';

export const setupRoutes = new Elysia({ prefix: '/api/setup-status' })
    .get('/', async () => {
        const missing: string[] = [];
        let dbStatus: 'ok' | 'error' = 'ok';

        // 1. Check Database Connection
        try {
            await db.run(sql`SELECT 1`);
        } catch (e) {
            console.error('Setup Check: DB Connection Failed', e);
            dbStatus = 'error';
        }

        // 2. Check LLM Provider
        const provider = env.LLM_PROVIDER;
        if (!provider) {
            missing.push('LLM_PROVIDER');
        } else {
            // Check specific keys based on provider
            if (provider === 'gemini' && !env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
            if (provider === 'openai' && !env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
            if (provider === 'claude' && !env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
        }

        const isSetup = dbStatus === 'ok' && missing.length === 0;

        return {
            isSetup,
            missing,
            provider,
            dbStatus
        };
    });
