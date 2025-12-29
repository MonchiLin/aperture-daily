import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { Database } from 'bun:sqlite';
import * as schema from './db/schema';

// Setup Database
const sqlite = new Database('local.db');
const db = drizzle(sqlite, { schema });

// Initialize TaskQueue
import { TaskQueue } from './src/services/tasks/TaskQueue';
import { getBusinessDate } from './src/lib/time';
import { fetchAndStoreDailyWords } from './src/services/dailyWords';

const queue = new TaskQueue(db);

// Environment Validation (for Worker)
const env = {
    LLM_API_KEY: process.env.VITE_LLM_API_KEY || process.env.LLM_API_KEY || '',
    LLM_BASE_URL: process.env.VITE_LLM_BASE_URL || process.env.LLM_BASE_URL || '',
    LLM_MODEL_DEFAULT: process.env.VITE_LLM_MODEL_DEFAULT || process.env.LLM_MODEL_DEFAULT || 'gpt-4o'
};

if (!env.LLM_API_KEY) console.warn("WARNING: LLM_API_KEY is missing. Worker will fail.");

// Background Worker Loop
const WORKER_INTERVAL_MS = 10000; // Check every 10 seconds
let isWorking = false;

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

// Setup Server
const app = new Elysia()
    .use(cors())
    .use(swagger())
    .get("/", () => "Hello Elysia from dancix backend!")
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
        const cookie = process.env.SHANBAY_COOKIE || "";

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
            const results = await db.select().from(schema.tasks).where(eq(schema.tasks.taskDate, task_date as string)).orderBy(desc(schema.tasks.createdAt));
            console.log(`[GET /api/tasks] Found ${results.length} tasks`);
            return { tasks: results };
        } catch (e: any) {
            console.error(`[GET /api/tasks] Error:`, e);
            return { status: "error", message: e.message, stack: e.stack };
        }
    })
    // Get single task
    .get("/api/tasks/:id", async ({ params: { id } }) => {
        const result = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id as any)).limit(1);
        if (result.length === 0) return { error: "Not found", status: 404 };
        return result[0];
    })
    // --- Content Retrieval ---
    .get("/api/days", async () => {
        // Return list of dates that have published tasks/articles
        const result = await db
            .selectDistinct({ date: schema.tasks.taskDate })
            .from(schema.tasks)
            .where(eq(schema.tasks.status, 'succeeded')) // Assuming succeeded = published content avail
            .orderBy(desc(schema.tasks.taskDate));
        return { days: result.map(r => r.date) };
    })
    .get("/api/day/:date", async ({ params: { date } }) => {
        try {
            const taskRows = await db
                .select()
                .from(schema.tasks)
                .where(and(eq(schema.tasks.taskDate, date), eq(schema.tasks.type, 'article_generation')))
                .orderBy(schema.tasks.finishedAt);

            const taskIds = taskRows.map((t) => t.id);
            const articleRows = taskIds.length > 0
                ? await db
                    .select()
                    .from(schema.articles)
                    .where(inArray(schema.articles.generationTaskId, taskIds))
                    .orderBy(schema.articles.model)
                : [];

            const articlesByTaskId = articleRows.reduce<Record<string, typeof articleRows>>((acc, article) => {
                const taskId = article.generationTaskId as string;
                if (!acc[taskId]) acc[taskId] = [];
                acc[taskId].push(article);
                return acc;
            }, {});

            const publishedTaskGroups = taskRows
                .map((task) => ({
                    task,
                    articles: articlesByTaskId[task.id] ?? []
                }))
                .filter((group) => group.articles.length > 0);

            return { publishedTaskGroups };
        } catch (e: any) {
            console.error(`[GET /api/day/${date}] Error:`, e);
            return { status: "error", message: e.message };
        }
    })
    .get("/api/day/:date/words", async ({ params: { date } }) => {
        try {
            const rows = await db.select().from(schema.dailyWords).where(eq(schema.dailyWords.date, date)).limit(1);
            const row = rows[0];
            if (!row) {
                return { date, words: [], word_count: 0 };
            }

            const newWords = JSON.parse(row.newWordsJson);
            const reviewWords = JSON.parse(row.reviewWordsJson);
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
        await db.delete(schema.tasks).where(eq(schema.tasks.id, id as any));
        // Also delete related articles?
        await db.delete(schema.articles).where(eq(schema.articles.generationTaskId, id as any));
        return { status: "ok" };
    })
    // Article operations
    .get("/api/articles/:id", async ({ params: { id } }) => {
        try {
            const rows = await db
                .select()
                .from(schema.articles)
                .innerJoin(schema.tasks, eq(schema.articles.generationTaskId, schema.tasks.id))
                .where(eq(schema.articles.id, id))
                .limit(1);

            if (rows.length === 0) return { error: "Not found", status: 404 };
            return rows[0];
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    })
    .delete("/api/articles/:id", async ({ params: { id } }) => {
        await db.delete(schema.articles).where(eq(schema.articles.id, id));
        return { status: "ok" };
    })

    // --- Authentication ---
    .post("/api/auth/login", ({ body, error }: any) => {
        if (body?.key === process.env.ADMIN_KEY) return { status: "ok" };
        return error(401, { error: "Unauthorized" });
    })
    .get("/api/auth/check", ({ request, error }) => {
        const key = request.headers.get('x-admin-key');
        if (key === process.env.ADMIN_KEY) return { status: "ok" };
        return error(401, { error: "Unauthorized" });
    })

    // --- Profiles Management ---
    .get("/api/profiles", async () => {
        return await db.select().from(schema.generationProfiles).orderBy(desc(schema.generationProfiles.updatedAt));
    })
    .get("/api/profiles/:id", async ({ params: { id }, error }) => {
        const res = await db.select().from(schema.generationProfiles).where(eq(schema.generationProfiles.id, id)).limit(1);
        if (res.length === 0) return error(404, "Not found");
        return res[0];
    })
    .post("/api/profiles", async ({ body, error }: any) => {
        // Simple validation could be added here
        try {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            await db.insert(schema.generationProfiles).values({
                id,
                name: body.name,
                topicPreference: body.topicPreference || "",
                concurrency: Number(body.concurrency) || 1,
                timeoutMs: Number(body.timeoutMs) || 60000,
                createdAt: now,
                updatedAt: now
            });
            return { status: "ok", id };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .put("/api/profiles/:id", async ({ params: { id }, body, error }: any) => {
        try {
            await db.update(schema.generationProfiles).set({
                name: body.name,
                topicPreference: body.topicPreference,
                concurrency: Number(body.concurrency),
                timeoutMs: Number(body.timeoutMs),
                updatedAt: new Date().toISOString()
            }).where(eq(schema.generationProfiles.id, id));
            return { status: "ok" };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .delete("/api/profiles/:id", async ({ params: { id }, error }) => {
        await db.delete(schema.generationProfiles).where(eq(schema.generationProfiles.id, id));
        return { status: "ok" };
    })

    // --- Highlights Management ---
    .get("/api/articles/:id/highlights", async ({ params: { id } }) => {
        return await db.select().from(schema.highlights).where(eq(schema.highlights.articleId, id));
    })
    .post("/api/highlights", async ({ body, error }: any) => {
        try {
            const id = body.id || crypto.randomUUID();
            await db.insert(schema.highlights).values({
                id,
                articleId: body.articleId,
                actor: body.actor || 'user',
                startMetaJson: JSON.stringify(body.startMeta), // Assuming frontend sends object
                endMetaJson: JSON.stringify(body.endMeta),
                text: body.text,
                note: body.note,
                styleJson: body.style ? JSON.stringify(body.style) : null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            return { status: "ok", id };
        } catch (e: any) {
            console.error(e);
            return error(500, e.message);
        }
    })
    .put("/api/highlights/:id", async ({ params: { id }, body, error }: any) => {
        try {
            // Supports updating text, note, etc.
            await db.update(schema.highlights).set({
                note: body.note,
                updatedAt: new Date().toISOString()
            }).where(eq(schema.highlights.id, id));
            return { status: "ok" };
        } catch (e: any) {
            return error(500, e.message);
        }
    })
    .delete("/api/highlights/:id", async ({ params: { id } }) => {
        await db.delete(schema.highlights).where(eq(schema.highlights.id, id));
        return { status: "ok" };
    })

    // --- Task Admin ---
    .post("/api/tasks/delete-failed", async () => {
        const res = await db.delete(schema.tasks).where(eq(schema.tasks.status, 'failed')); // DELETE RETURNING is supported in some sqlite versions but run() returns info usually
        // Drizzle delete returns result info in some drivers, but for Bun SQLite it might differ.
        // For simplicity:
        return { status: "ok" };
    })

    .listen(3000);

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);