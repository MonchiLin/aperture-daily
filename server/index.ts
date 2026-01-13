/**
 * UpWord 服务器入口
 *
 * 技术栈：Elysia (Bun) + SQLite (D1/Local)
 */

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { db } from './src/db/factory';
import { TaskQueue } from './src/services/tasks/queue';
import { AppError, formatErrorResponse } from './src/errors/AppError';

// ─────────────────────────────────────────────────────────────
// 路由导入
// ─────────────────────────────────────────────────────────────
import { healthRoutes } from './routes/health';
import { tasksRoutes } from './routes/tasks';
import { wordsRoutes } from './routes/words';
import { contentRoutes } from './routes/content';
import { articlesRoutes } from './routes/articles';
import { authRoutes, getAdminKey } from './routes/auth';
import { profilesRoutes } from './routes/profiles';
import { highlightsRoutes } from './routes/highlights';
import { adminRoutes } from './routes/admin';
import { cronRoutes } from './routes/cron';
import { echoesRoutes } from './routes/echoes';
import { ttsRoutes } from './routes/tts';
import { configRoutes } from './routes/config';
import { setupRoutes } from './routes/setup';
import { topicsRoutes } from './routes/topics';
import { rssRoutes } from './routes/rss';
import { env } from './config/env';

// ─────────────────────────────────────────────────────────────
// 后台 Worker 导入
// ─────────────────────────────────────────────────────────────
import { startTaskWorker } from './workers/taskWorker';
import { startCronScheduler } from './workers/cronScheduler';

console.log("Using D1 (Strict). Skipping runtime migration (Managed via Wrangler/Drizzle Kit).");

// ─────────────────────────────────────────────────────────────
// 初始化核心服务
// ─────────────────────────────────────────────────────────────

const queue = new TaskQueue(db);

// 启动后台 Worker（非阻塞）
startTaskWorker(queue);
startCronScheduler(queue);

// ─────────────────────────────────────────────────────────────
// 错误处理配置
// ─────────────────────────────────────────────────────────────

/** Elysia 内置错误码到 HTTP 状态码映射 */
const errorCodeToStatus: Record<string, number> = {
    'NOT_FOUND': 404,
    'VALIDATION': 400,
    'PARSE': 400,
    'UNKNOWN': 500,
    'INTERNAL_SERVER_ERROR': 500
};

// ─────────────────────────────────────────────────────────────
// 应用组装
// ─────────────────────────────────────────────────────────────

const app = new Elysia()
    // 跨域配置：允许所有来源 + Cookie
    .use(cors({
        origin: true,
        credentials: true
    }))

    // 全局错误处理器：统一响应格式
    .onError(({ code, error, set }) => {
        // 自定义 AppError 处理
        if (error instanceof AppError) {
            set.status = error.statusCode;
            if (error.statusCode >= 500) {
                console.error(`[AppError] Code: ${error.code}`, error);
            }
            return formatErrorResponse(error);
        }

        // Elysia 内置错误处理
        const status = (typeof code === 'string' ? errorCodeToStatus[code] : undefined) || 500;
        set.status = status;

        if (status >= 500) {
            console.error(`[ServerError] Code: ${code}`, error);
        }

        return formatErrorResponse(error, String(code));
    })

    // Swagger API 文档
    .use(swagger({
        documentation: {
            info: {
                title: 'UpWord API',
                version: '1.0.0',
                description: 'UpWord 每日单词学习平台 API'
            }
        }
    }))

    // 公开路由（无需认证）
    .use(healthRoutes)
    .use(authRoutes)

    // ─────────────────────────────────────────────────────────
    // 管理员认证中间件
    //
    // 保护策略：
    // - /api/admin/*：全部保护
    // - /api/tasks/*：全部保护（任务管理）
    // - /api/articles：仅 DELETE/PATCH 保护（读取公开）
    // - /api/cron/*：全部保护（定时任务触发）
    // ─────────────────────────────────────────────────────────
    .onBeforeHandle(({ request }) => {
        const path = new URL(request.url).pathname;
        const isProtected = path.startsWith('/api/admin') ||
            path.startsWith('/api/tasks') ||
            path.startsWith('/api/generate') ||
            path.startsWith('/api/profiles') ||
            path.startsWith('/api/words') ||
            path.startsWith('/api/cron') ||
            path.startsWith('/api/topics') || // [Protect Topics]
            (path.startsWith('/api/articles') && (request.method === 'DELETE' || request.method === 'PATCH'));

        if (!isProtected) return;

        // 支持 Header (x-admin-key) 和 Cookie (admin_key) 两种方式
        const key = getAdminKey(request);
        if (key !== env.ADMIN_KEY) {
            throw AppError.unauthorized('Admin key required');
        }
    })

    // 业务路由
    .use(tasksRoutes(queue))
    .use(wordsRoutes)
    .use(contentRoutes)
    .use(articlesRoutes)
    .use(profilesRoutes)
    .use(highlightsRoutes)
    .use(adminRoutes(queue))
    .use(cronRoutes(queue))
    .use(echoesRoutes)
    .use(ttsRoutes)
    .use(configRoutes)
    .use(setupRoutes)
    .use(topicsRoutes)
    .use(rssRoutes) // [Register RSS]
    .listen(Number(process.env.PORT) || 3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
