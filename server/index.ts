import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import * as schema from './db/schema';
import { db } from './src/db/client';
import { TaskQueue } from './src/services/tasks/TaskQueue';
import { getBusinessDate, dayjs } from './src/lib/time';
import { fetchAndStoreDailyWords } from './src/services/dailyWords';

console.log("Using D1 (Strict). Skipping runtime migration (Managed via Wrangler/Drizzle Kit).");

// Initialize TaskQueue
const queue = new TaskQueue(db);

// Environment Validation (for Worker)
const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL,
    LLM_MODEL_DEFAULT: process.env.LLM_MODEL
};

if (!env.GEMINI_API_KEY) console.warn("WARNING: GEMINI_API_KEY is missing. Worker will fail.");

// Background Worker Loop
const WORKER_INTERVAL_MS = 10000; // Check every 10 seconds
let isWorking = false;

/**
 * Background Task Worker
 * 
 * Periodically wakes up to process the ephemeral Task Queue.
 * Architecture: Polling-based worker.
 * - Interval: 10 seconds.
 * - Concurrency: Single-threaded event loop (effectively serial unless partitioned).
 * - Safety: Catches all errors to prevent process crash.
 */
async function runWorker() {
    if (isWorking) return;
    isWorking = true;
    try {
        await queue.processQueue(env);
    } catch (e) {
        console.error("Worker error:", e);
    } finally {
        isWorking = false;
        setTimeout(runWorker, WORKER_INTERVAL_MS);
    }
}

// Start Worker
setTimeout(runWorker, 1000); // Start after 1s delay

// =========================================
// Server Initialization (Elysia)
// =========================================
const app = new Elysia()
    .use(cors())
    .use(swagger())
    .get("/", () => `Hello Elysia from dancix backend! (Build: ${process.env.BUILD_TIME || 'Dev'})`)
    .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
    // Verification test for DB connection
    .get("/db-check", async () => {
        try {
            // Simple query to check if DB is responsive
            const result = await db.select({ count: schema.tasks.id }).from(schema.tasks).limit(1);
            return { status: "connected", result };
        } catch (e: any) {
            return { status: "error", error: e.message };
        }
    })
    .post("/api/generate", async ({ body }: { body: any }) => {
        console.log("Receive generation request:", body);
        // Support both prop names for compatibility
        const date = body.task_date || body.date || getBusinessDate();

        try {
            // Trigger manual task generation
            const tasks = await queue.enqueue(date, 'manual');
            return { status: "ok", tasks };
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    })
    // Fetch words from Shanbay
    .post("/api/words/fetch", async ({ body, request }: { body: any, request: Request }) => {
        console.log("Receive fetch words request:", body);
        const date = body.task_date || body.date || getBusinessDate();
        // Since we are in split stack, we rely on the client to pass the cookie, 
        // OR we can read it from the request headers if forwarded by a proxy.
        // But for now, let's assume the client sends it in the body OR logic handles it.
        // Actually, previous logic read it from 'cookie' header.

        // Always use environment cookie as per user request
        const cookie = process.env.SHANBAY_COOKIE;

        console.log(`[Fetch Words] Using Env Cookie. Length: ${cookie.length}`);

        if (!cookie) {
            return { status: "error", message: "Missing SHANBAY_COOKIE in .env" };
        }

        try {
            const result = await fetchAndStoreDailyWords(db, {
                taskDate: date,
                shanbayCookie: cookie
            });
            return { status: "ok", result };
        } catch (e: any) {
            console.error("Fetch words error:", e);
            return { status: "error", message: e.message };
        }
    })
    // List tasks by date
    .get("/api/tasks", async ({ query: { task_date } }) => {
        console.log(`[GET /api/tasks] Request for date: ${task_date}`);
        try {
            if (!task_date) return { error: "Missing task_date", status: 400 };

            // Use raw SQL to ensure we get data despite ORM mapping issues
            const results = await db.all(sql`SELECT * FROM tasks WHERE task_date = ${task_date} ORDER BY created_at DESC`);

            console.log(`[GET /api/tasks] Found ${results.length} tasks`);
            return { tasks: results };
        } catch (e: any) {
            console.error(`[GET /api/tasks] Error:`, e);
            return { status: "error", message: e.message, stack: e.stack };
        }
    })
    // Get single task
    .get("/api/tasks/:id", async ({ params: { id } }) => {
        const result = await db.all(sql`SELECT * FROM tasks WHERE id = ${id} LIMIT 1`);
        if (result.length === 0) return { error: "Not found", status: 404 };
        return result[0];
    })
    // --- Content Retrieval ---
    .get("/api/days", async () => {
        try {
            const result = await db.all(sql`SELECT DISTINCT task_date FROM tasks WHERE status = 'succeeded' ORDER BY task_date DESC`);
            return { days: result.map((r: any) => r.task_date) };
        } catch (e: any) {
            console.error("API Error /api/days:", e);
            return { error: e.message };
        }
    })
    .get("/api/day/:date", async ({ params: { date } }) => {
        try {
            const taskRows = await db.all(sql`
                SELECT * FROM tasks 
                WHERE task_date = ${date} AND type = 'article_generation' 
                ORDER BY finished_at
            `);

            const taskIds = taskRows.map((t: any) => t.id);
            let articleRows: any[] = [];

            if (taskIds.length > 0) {
                // Manual IN clause construction or iteration
                // D1 might not support array param for IN directly via simple proxy, use explicit string construction safely
                const placeholders = taskIds.map(() => '?').join(',');
                // drizzle-orm sql helper doesn't auto-expand arrays easily in basic mode, 
                // but for raw sql we need manual handling.

                // Let's use simple loop if few tasks, or construct dynamic sql
                const sqlQuery = `SELECT * FROM articles WHERE generation_task_id IN (${taskIds.map(id => `'${id}'`).join(',')}) ORDER BY model`;
                articleRows = await db.all(sql.raw(sqlQuery));
            }

            const articlesByTaskId = articleRows.reduce((acc: any, article: any) => {
                const taskId = article.generation_task_id;
                if (!acc[taskId]) acc[taskId] = [];
                acc[taskId].push(article);
                return acc;
            }, {});

            const publishedTaskGroups = taskRows
                .map((task: any) => ({
                    task,
                    articles: articlesByTaskId[task.id] ?? []
                }))
                .filter((group: any) => group.articles.length > 0);

            return { publishedTaskGroups };
        } catch (e: any) {
            console.error(`[GET /api/day/${date}] Error:`, e);
            return { status: "error", message: e.message };
        }
    })
    .get("/api/day/:date/words", async ({ params: { date } }) => {
        try {
            const rows = await db.all(sql`SELECT * FROM daily_words WHERE date = ${date} LIMIT 1`);
            const row: any = rows[0];
            if (!row) {
                return { date, words: [], word_count: 0 };
            }

            const newWords = JSON.parse(row.new_words_json);
            const reviewWords = JSON.parse(row.review_words_json);
            const newList = Array.isArray(newWords) ? newWords : [];
            const reviewList = Array.isArray(reviewWords) ? reviewWords : [];
            return {
                date,
                new_words: newList,
                review_words: reviewList,
                new_count: newList.length,
                review_count: reviewList.length,
                word_count: newList.length + reviewList.length
            };
        } catch (e: any) {
            console.error(`[GET /api/day/${date}/words] Error:`, e);
            return { status: "error", message: e.message };
        }
    })
    // End of Daily Content API
    // Delete task
    .delete("/api/tasks/:id", async ({ params: { id } }) => {
        // Delete highlights for all articles in this task
        // We use a subquery to find usage. 
        // Note: D1/SQLite supports scalar subqueries in DELETE.
        await db.run(sql`
            DELETE FROM highlights 
            WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})
        `);
        // Delete articles
        await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${id}`);
        // Delete task
        await db.run(sql`DELETE FROM tasks WHERE id = ${id}`);
        return { status: "ok" };
    })
    // Article operations
    .get("/api/articles/:id", async ({ params: { id } }) => {
        try {
            // Return { articles: {...}, tasks: {...} } structure
            const articleRows = await db.all(sql`SELECT * FROM articles WHERE id = ${id} LIMIT 1`);
            if (articleRows.length === 0) return { error: "Not found", status: 404 };
            const article = articleRows[0];

            // Fetch related task
            const taskRows = await db.all(sql`SELECT * FROM tasks WHERE id = ${article.generation_task_id} LIMIT 1`);
            const task = taskRows.length > 0 ? taskRows[0] : null;

            return { articles: article, tasks: task };
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    })
    .delete("/api/articles/:id", async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE article_id = ${id}`);
        await db.run(sql`DELETE FROM articles WHERE id = ${id}`);
        return { status: "ok" };
    })
    // Admin Bulk Operations
    .post("/api/admin/tasks/delete-failed", async () => {
        try {
            // Find failed tasks first
            const failedTasks = await db.all(sql`SELECT id FROM tasks WHERE status = 'failed'`);
            if (failedTasks.length === 0) return { status: "ok", count: 0 };

            const ids = failedTasks.map((t: any) => t.id);
            // Loop for safety
            for (const id of ids) {
                // Delete highlights
                await db.run(sql`
                    DELETE FROM highlights 
                    WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id = ${id})
                `);
                // Delete articles
                await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${id}`);
                // Delete task
                await db.run(sql`DELETE FROM tasks WHERE id = ${id}`);
            }
            return { status: "ok", count: ids.length };
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    })

    // --- Authentication ---
    .post("/api/auth/login", ({ body, error }: any) => {
        if (body?.key === process.env.ADMIN_KEY) return { status: "ok" };
        return error(401, { error: "Unauthorized" });
    })
    .get("/api/auth/check", ({ request, error }: any) => {
        // Safe header access
        const key = request.headers.get ? request.headers.get('x-admin-key') : request.headers['x-admin-key'];
        if (key === process.env.ADMIN_KEY) return { status: "ok" };
        return error(401, { error: "Unauthorized" });
    })

    // --- Profiles Management ---
    .get("/api/profiles", async () => {
        return await db.all(sql`SELECT * FROM generation_profiles ORDER BY updated_at DESC`);
    })
    .get("/api/profiles/:id", async ({ params: { id }, error }) => {
        const res = await db.all(sql`SELECT * FROM generation_profiles WHERE id = ${id} LIMIT 1`);
        if (res.length === 0) return error(404, "Not found");
        return res[0];
    })
    .post("/api/profiles", async ({ body, error }: any) => {
        try {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            await db.run(sql`
                INSERT INTO generation_profiles (id, name, topic_preference, concurrency, timeout_ms, created_at, updated_at)
                VALUES (${id}, ${body.name}, ${body.topicPreference || ""}, ${Number(body.concurrency) || 1}, ${Number(body.timeoutMs) || 60000}, ${now}, ${now})
            `);
            return { status: "ok", id };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .put("/api/profiles/:id", async ({ params: { id }, body, error }: any) => {
        try {
            await db.run(sql`
                UPDATE generation_profiles 
                SET name = ${body.name}, 
                    topic_preference = ${body.topicPreference}, 
                    concurrency = ${Number(body.concurrency)}, 
                    timeout_ms = ${Number(body.timeoutMs)}, 
                    updated_at = ${new Date().toISOString()}
                WHERE id = ${id}
            `);
            return { status: "ok" };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .delete("/api/profiles/:id", async ({ params: { id }, error }) => {
        // Prevent deleting last profile? Optional. 
        // Iterate tasks to delete them nicely with cascade logic (Highlights -> Articles -> Tasks)
        // Or pure SQL cascade if we trust IDs. 
        // Let's reuse the logic: delete highlights -> articles -> tasks where profile_id matches.

        // 1. Find all tasks for this profile
        const profileTasks = await db.all(sql`SELECT id FROM tasks WHERE profile_id = ${id}`);
        const taskIds = profileTasks.map((t: any) => t.id);

        if (taskIds.length > 0) {
            // 2. Delete Highlights for these tasks
            // Can use nested subquery: SELECT id FROM articles WHERE generation_task_id IN (...)
            const placeholders = taskIds.map(() => '?').join(',');
            // Manually construct IN clause for raw SQL
            const inClause = taskIds.map(tid => `'${tid}'`).join(',');

            await db.run(sql.raw(`
                DELETE FROM highlights 
                WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id IN (${inClause}))
            `));

            // 3. Delete Articles
            await db.run(sql.raw(`DELETE FROM articles WHERE generation_task_id IN (${inClause})`));

            // 4. Delete Tasks
            await db.run(sql.raw(`DELETE FROM tasks WHERE id IN (${inClause})`));
        }

        // 5. Delete Profile
        await db.run(sql`DELETE FROM generation_profiles WHERE id = ${id}`);
        return { status: "ok" };
    })

    // --- Highlights Management ---
    .get("/api/articles/:id/highlights", async ({ params: { id } }) => {
        return await db.all(sql`SELECT * FROM highlights WHERE article_id = ${id}`);
    })
    .post("/api/highlights", async ({ body, error }: any) => {
        try {
            const id = body.id || crypto.randomUUID();
            await db.run(sql`
                INSERT INTO highlights (id, article_id, actor, start_meta_json, end_meta_json, text, note, style_json, created_at, updated_at)
                VALUES (${id}, ${body.articleId}, ${body.actor || 'user'}, ${JSON.stringify(body.startMeta)}, ${JSON.stringify(body.endMeta)}, ${body.text}, ${body.note}, ${body.style ? JSON.stringify(body.style) : null}, ${new Date().toISOString()}, ${new Date().toISOString()})
            `);
            return { status: "ok", id };
        } catch (e: any) {
            console.error(e);
            return error(500, e.message);
        }
    })
    .put("/api/highlights/:id", async ({ params: { id }, body, error }: any) => {
        try {
            await db.run(sql`UPDATE highlights SET note = ${body.note}, updated_at = ${new Date().toISOString()} WHERE id = ${id}`);
            return { status: "ok" };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .delete("/api/highlights/:id", async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE id = ${id}`);
        return { status: "ok" };
    })
    // Task Admin Actions
    .post("/api/admin/tasks/retry-failed", async ({ body }: any) => {
        try {
            const date = body?.task_date;

            // Build query for failed tasks
            let queryStr = "SELECT id FROM tasks WHERE status = 'failed'";
            if (date) {
                queryStr += ` AND task_date = '${date}'`;
            }

            const failedTasks = await db.all(sql.raw(queryStr));
            if (failedTasks.length === 0) return { status: "ok", count: 0 };

            const taskIds = failedTasks.map((t: any) => t.id);
            const inClause = taskIds.map(id => `'${id}'`).join(',');

            // Reset tasks
            await db.run(sql.raw(`
                UPDATE tasks 
                SET status = 'queued', 
                    version = version + 1, 
                    started_at = NULL, 
                    finished_at = NULL, 
                    error_message = NULL, 
                    error_context_json = NULL
                WHERE id IN (${inClause})
            `));

            return { status: "ok", count: taskIds.length };
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    })
    .post("/api/admin/tasks/delete-failed", async ({ body }: any) => {
        try {
            const date = body?.task_date;

            // Build query for failed tasks
            // Note: simple D1 proxy SQL construction
            let queryStr = "SELECT id FROM tasks WHERE status = 'failed'";
            if (date) {
                queryStr += ` AND task_date = '${date}'`;
            }

            const failedTasks = await db.all(sql.raw(queryStr));
            if (failedTasks.length === 0) return { status: "ok", count: 0 };

            const taskIds = failedTasks.map((t: any) => t.id);
            let deletedCount = 0;

            for (const taskId of taskIds) {
                try {
                    // 1. Find Articles for this task
                    const articles = await db.all(sql`SELECT id FROM articles WHERE generation_task_id = ${taskId}`);
                    const articleIds = articles.map((a: any) => a.id);

                    if (articleIds.length > 0) {
                        // 2. Delete Highlights for these articles
                        // Explicitly delete by ID list to avoid complex subquery DELETE issues
                        const articleIdList = articleIds.map(id => `'${id}'`).join(',');
                        await db.run(sql.raw(`DELETE FROM highlights WHERE article_id IN (${articleIdList})`));

                        // 3. Delete Articles
                        await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${taskId}`);
                    }

                    // 4. Delete Tasks
                    await db.run(sql`DELETE FROM tasks WHERE id = ${taskId}`);
                    deletedCount++;
                } catch (e: any) {
                    console.error(`Failed to delete task ${taskId}:`, e.message);
                    // Continue deleting others even if one fails
                }
            }

            return { status: "ok", count: deletedCount, totalFound: taskIds.length };
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    })
// --- Internal Cron Scheduler ---
// Logic to be shared between API and internal scheduler
async function executeCronLogic(taskDate: string, logPrefix: string) {
    try {
        // 1. Fetch Words (if not exists)
        const existingWords = await db.all(sql`SELECT count(*) as c FROM daily_words WHERE date = ${taskDate}`);
        if ((existingWords[0]?.c || 0) === 0) {
            console.log(`${logPrefix} Fetching words for ${taskDate}`);
            const cookie = process.env.SHANBAY_COOKIE;
            if (!cookie) throw new Error("Missing SHANBAY_COOKIE in .env");
            await fetchAndStoreDailyWords(db, { taskDate, shanbayCookie: cookie });
        } else {
            console.log(`${logPrefix} Words already exist for ${taskDate}`);
        }

        // 2. Enqueue Task (Queue.enqueue is idempotent for 'cron' source)
        console.log(`${logPrefix} Enqueuing tasks for ${taskDate}`);
        const tasks = await queue.enqueue(taskDate, 'cron');
        return { status: "ok", tasks };
    } catch (e: any) {
        console.error(`${logPrefix} Error:`, e);
        throw e;
    }
}

// Check every minute
const CRON_INTERVAL_MS = 60000;
let lastCronRunDate = '';

function runCronScheduler() {
    setInterval(async () => {
        // Use dayjs with configured timezone (Asia/Shanghai)
        const now = dayjs();
        const hour = now.hour();
        const todayStr = now.format('YYYY-MM-DD');

        // Run between 09:00 and 10:00
        if (hour === 9) {
            if (lastCronRunDate !== todayStr) {
                console.log(`[Cron Scheduler] Triggering daily job for ${todayStr} (Hour: ${hour})`);
                try {
                    await executeCronLogic(todayStr, '[Cron Scheduler]');
                    lastCronRunDate = todayStr;
                    console.log(`[Cron Scheduler] Daily job done.`);
                } catch (e) {
                    console.error(`[Cron Scheduler] Daily job failed, will retry next minute.`);
                }
            }
        }
    }, CRON_INTERVAL_MS);
    console.log("[Cron Scheduler] Started. Target window: 09:00 - 10:00 CST");
}

// Start Scheduler
runCronScheduler();

// Updated API triggering the same logic
app.post("/api/cron/trigger", async ({ request, error }: any) => {
    const key = request.headers.get ? request.headers.get('x-admin-key') : request.headers['x-admin-key'];
    if (key !== process.env.ADMIN_KEY) return error(401, { error: "Unauthorized" });

    // Use dayjs for consistency
    const taskDate = dayjs().format('YYYY-MM-DD');

    try {
        const res = await executeCronLogic(taskDate, '[API Cron Trigger]');
        return res;
    } catch (e: any) {
        return { status: "error", message: e.message };
    }
});

app.listen(3000);

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);