import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { db } from './src/db/client';
import { TaskQueue } from './src/services/tasks/TaskQueue';

// Import routes
import { healthRoutes } from './routes/health';
import { tasksRoutes } from './routes/tasks';
import { wordsRoutes } from './routes/words';
import { contentRoutes } from './routes/content';
import { articlesRoutes } from './routes/articles';
import { authRoutes } from './routes/auth';
import { profilesRoutes } from './routes/profiles';
import { highlightsRoutes } from './routes/highlights';
import { adminRoutes } from './routes/admin';
import { cronRoutes } from './routes/cron';

// Import workers
import { startTaskWorker } from './workers/taskWorker';
import { startCronScheduler } from './workers/cronScheduler';

console.log("Using D1 (Strict). Skipping runtime migration (Managed via Wrangler/Drizzle Kit).");

// Initialize TaskQueue
const queue = new TaskQueue(db);

// Start Background Workers
startTaskWorker(queue);
startCronScheduler(queue);

// Assemble Application
const app = new Elysia()
    .use(cors())
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
    .use(tasksRoutes(queue))
    .use(wordsRoutes)
    .use(contentRoutes)
    .use(articlesRoutes)
    .use(authRoutes)
    .use(profilesRoutes)
    .use(highlightsRoutes)
    .use(adminRoutes(queue))
    .use(cronRoutes(queue))
    .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);