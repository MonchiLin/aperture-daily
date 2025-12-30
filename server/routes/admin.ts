import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { TaskQueue } from '../src/services/tasks/TaskQueue';

export const adminRoutes = (queue: TaskQueue) => new Elysia({ prefix: '/api/admin' })
    .post('/tasks/retry-failed', async ({ body }: any) => {
        try {
            const date = body?.task_date;

            let queryStr = "SELECT id FROM tasks WHERE status = 'failed'";
            if (date) {
                queryStr += ` AND task_date = '${date}'`;
            }

            const failedTasks = await db.all(sql.raw(queryStr));
            if (failedTasks.length === 0) return { status: "ok", count: 0 };

            const taskIds = failedTasks.map((t: any) => t.id);
            const inClause = taskIds.map(id => `'${id}'`).join(',');

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
    .post('/tasks/delete-failed', async ({ body }: any) => {
        try {
            const date = body?.task_date;

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
                    const articles = await db.all(sql`SELECT id FROM articles WHERE generation_task_id = ${taskId}`);
                    const articleIds = articles.map((a: any) => a.id);

                    if (articleIds.length > 0) {
                        const articleIdList = articleIds.map(id => `'${id}'`).join(',');
                        await db.run(sql.raw(`DELETE FROM highlights WHERE article_id IN (${articleIdList})`));
                        await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${taskId}`);
                    }

                    await db.run(sql`DELETE FROM tasks WHERE id = ${taskId}`);
                    deletedCount++;
                } catch (e: any) {
                    console.error(`Failed to delete task ${taskId}:`, e.message);
                }
            }

            return { status: "ok", count: deletedCount, totalFound: taskIds.length };
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    });
