import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { db } from './src/db/client';
import { TaskQueue } from './src/services/tasks/TaskQueue';
import { AppError, formatErrorResponse } from './src/errors/AppError';

// Import routes
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
import { env } from './config/env';

// Import workers
import { startTaskWorker } from './workers/taskWorker';
import { startCronScheduler } from './workers/cronScheduler';

console.log("Using D1 (Strict). Skipping runtime migration (Managed via Wrangler/Drizzle Kit).");

// Initialize TaskQueue
const queue = new TaskQueue(db);

// Start Background Workers
startTaskWorker(queue);
startCronScheduler(queue);

// Elysia 内置错误码到 HTTP 状态码映射
const errorCodeToStatus: Record<string, number> = {
    'NOT_FOUND': 404,
    'VALIDATION': 400,
    'PARSE': 400,
    'UNKNOWN': 500,
    'INTERNAL_SERVER_ERROR': 500
};

// Assemble Application
const app = new Elysia()
    .use(cors({
        origin: true,       // 允许所有来源
        credentials: true   // 允许携带 Cookie
    }))
    // --- 全局错误处理器 (统一响应格式) ---
    .onError(({ code, error, set }) => {
        // 处理自定义 AppError
        if (error instanceof AppError) {
            set.status = error.statusCode;
            if (error.statusCode >= 500) {
                console.error(`[AppError] Code: ${error.code}`, error);
            }
            return formatErrorResponse(error);
        }

        // 处理 Elysia 内置错误
        const status = (typeof code === 'string' ? errorCodeToStatus[code] : undefined) || 500;
        set.status = status;

        if (status >= 500) {
            console.error(`[ServerError] Code: ${code}`, error);
        }

        return formatErrorResponse(error, String(code));
    })
    // ------------------------------------
    .use(swagger({
        documentation: {
            info: {
                title: 'Aperture Daily API',
                version: '1.0.0',
                description: 'Aperture Daily 每日单词学习平台 API'
            }
        }
    }))
    .use(healthRoutes)
    .use(authRoutes)
    // --- Admin Protection Middleware (支持 header 和 cookie) ---
    .onBeforeHandle(({ request }) => {
        const path = new URL(request.url).pathname;
        const isProtected = path.startsWith('/api/admin') ||
            path.startsWith('/api/tasks') ||
            path.startsWith('/api/generate') ||
            path.startsWith('/api/profiles') ||
            path.startsWith('/api/words') ||
            path.startsWith('/api/cron') ||
            (path.startsWith('/api/articles') && (request.method === 'DELETE' || request.method === 'PATCH'));

        if (!isProtected) return;

        const key = getAdminKey(request);
        if (key !== env.ADMIN_KEY) {
            throw AppError.unauthorized('Admin key required');
        }
    })
    // ------------------------------------
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
    .listen(Number(process.env.PORT) || 3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);