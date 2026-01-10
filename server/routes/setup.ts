import { Elysia } from 'elysia';
import { db } from '../src/db/factory';
import { sql } from 'kysely';
import { env } from '../config/env';

export const setupRoutes = new Elysia({ prefix: '/api/setup-status' })
    .get('/', async () => {
        const missing: string[] = [];
        let dbStatus: 'ok' | 'error' = 'ok';

        // 1. Connectivity Check
        try {
            // Simple query to check connection
            await sql`SELECT 1`.execute(db);
        } catch (e) {
            console.error('设置检查: 数据库连接失败', e);
            dbStatus = 'error';
        }

        // 2. Environment Integrity
        const provider = env.LLM_PROVIDER;
        if (!provider) {
            missing.push('LLM_PROVIDER');
        } else {
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
