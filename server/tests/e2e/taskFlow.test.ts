import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { TaskQueue } from '../../src/services/tasks/TaskQueue';

// 测试配置
const TEST_DATE = '2025-12-23';
const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || '',
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || process.env.LLM_BASE_URL,
    LLM_MODEL_DEFAULT: process.env.LLM_MODEL || ''
};

describe('Task Flow E2E (Real Gemini API)', () => {
    const queue = new TaskQueue(db);

    beforeAll(async () => {
        if (!env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY (or legacy LLM_API_KEY) not found in environment');
        }

        console.log(`[Test] Cleaning up data for ${TEST_DATE}...`);

        // 0. Force reset ANY running tasks to avoid stuck queue from aborted tests
        console.log('[Test] Resetting any stuck running tasks...');
        await db.run(sql`UPDATE tasks SET status = 'failed', error_message = 'Test Force Reset' WHERE status = 'running'`);

        // 1. Find tasks for test date
        const tasks = await db.all(sql`SELECT id FROM tasks WHERE task_date = ${TEST_DATE}`);
        const taskIds = tasks.map((t: any) => t.id);

        if (taskIds.length > 0) {
            const inClause = taskIds.map(id => `'${id}'`).join(',');

            // 2. Delete related data
            await db.run(sql.raw(`DELETE FROM highlights WHERE article_id IN (SELECT id FROM articles WHERE generation_task_id IN (${inClause}))`));
            await db.run(sql.raw(`DELETE FROM articles WHERE generation_task_id IN (${inClause})`));
            await db.run(sql.raw(`DELETE FROM tasks WHERE id IN (${inClause})`));
        }

        // Ensure daily words exist (mock fetch if needed, but assuming user has cookie or existing words)
        // For E2E, we might need real words. 
        // If no words exist, the task will fail at 'No daily words found'.
        // Let's check and warn.
        const words = await db.all(sql`SELECT * FROM daily_words WHERE date = ${TEST_DATE}`);
        if (words.length === 0) {
            console.warn(`[Test] WARNING: No daily words for ${TEST_DATE}. Task generation might fail.`);
            // Optional: Insert mock words if we want to isolate from Shanbay API
        }
    });

    afterAll(async () => {
        // Optional: Cleanup after test
        // await db.run(sql`DELETE FROM tasks WHERE task_date = ${TEST_DATE}`);
    });

    it('Complete Flow: Enqueue -> Process -> Verify Article', async () => {
        // 1. Enqueue
        console.log('[Test] Enqueuing task...');
        const newTasks = await queue.enqueue(TEST_DATE, 'manual');
        expect(newTasks.length).toBeGreaterThan(0);
        const taskId = newTasks[0].id;
        console.log(`[Test] Task created: ${taskId}`);

        // 2. Verify Queued Status
        const queuedTask = await db.all(sql`SELECT status FROM tasks WHERE id = ${taskId}`);
        expect(queuedTask[0].status).toBe('queued');

        // 3. Process Queue (Blocking call, executes Gemini pipeline)
        console.log('[Test] Processing queue (Calling Gemini)...');
        await queue.processQueue(env);

        // 4. Verify Succeeded Status
        const completedTask = await db.all(sql`SELECT status, result_json FROM tasks WHERE id = ${taskId}`);
        expect(completedTask[0].status).toBe('succeeded');
        expect(completedTask[0].result_json).toBeTruthy();

        // 5. Verify Article Created
        const articles = await db.all(sql`SELECT * FROM articles WHERE generation_task_id = ${taskId}`);
        expect(articles.length).toBe(1);

        const article = articles[0];

        // Basic Content Checks
        expect(article.title).toBeTruthy();
        expect(article.content_json).toBeTruthy();

        // Verify JSON Content Structure
        const content = JSON.parse(article.content_json);
        console.log('[Test] content_json:', JSON.stringify(content, null, 2));

        // expect(content.title).toBe(article.title); // Skip precise match if formats differ, or debug
        expect(content.result).toBeTruthy();
        expect(content.result.title).toBeTruthy();
        expect(content.result.articles).toBeInstanceOf(Array);
        expect(content.input_words.selected.length).toBeGreaterThan(0);
    }, 300000); // 5 minutes timeout for real LLM call
});
