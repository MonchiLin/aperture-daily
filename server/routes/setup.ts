import { Elysia } from 'elysia';
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';
import { env } from '../config/env';

export const setupRoutes = new Elysia({ prefix: '/api/setup-status' })
    .get('/', async () => {
        const missing: string[] = [];
        let dbStatus: 'ok' | 'error' = 'ok';

        // 1. 数据库连通性检查 (Connectivity Check)
        // 只是简单的 SELECT 1，不检查表结构。
        // 因为表结构迁移 (Migrations) 应该在部署阶段完成。
        try {
            await db.run(sql`SELECT 1`);
        } catch (e) {
            console.error('设置检查: 数据库连接失败', e);
            dbStatus = 'error';
        }

        // 2. 环境变量完整性检查 (Environment Integrity)
        // 采用 "Fail-Fast" 策略：如果选择了某个 Provider，其对应的 Key 必须存在。
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
