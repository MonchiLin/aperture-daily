import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { TaskQueue } from '../src/services/tasks/queue';

interface IdRow { id: string; }
interface AdminBody { task_date?: string; }

/**
 * Admin Routes (后台管理路由)
 * 
 * 核心功能：
 * 提供针对 "Failed Datasets" (失败数据集) 的自动化运维能力。
 * 
 * 关键逻辑：Cascading Cleanup (级联清理)
 * 当我们在数据库层面没有设置完整的 `ON DELETE CASCADE` 外键时 (Drizzle/SQLite 的某些限制)，
 * 必须在应用层手动维护引用完整性。
 * `delete-failed` 路由演示了如何安全地移除一个 Task 及其关联的：
 * - Articles
 * - Highlights
 * - Word Indexes
 * 确保不会留下孤儿数据 (Orphaned Records)。
 */
export const adminRoutes = (_queue: TaskQueue) => new Elysia({ prefix: '/api/admin' })
    .post('/tasks/retry-failed', async ({ body }) => {
        const b = body as AdminBody;
        const date = b?.task_date;

        let queryStr = "SELECT id FROM tasks WHERE status = 'failed'";
        if (date) {
            queryStr += ` AND task_date = '${date}'`;
        }

        const failedTasks = await db.all(sql.raw(queryStr));
        if (failedTasks.length === 0) return { status: "ok", count: 0 };

        const taskIds = (failedTasks as IdRow[]).map((t) => t.id);
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
    })
    .post('/tasks/delete-failed', async ({ body }) => {
        const b = body as AdminBody;
        const date = b?.task_date;

        let queryStr = "SELECT id FROM tasks WHERE status = 'failed'";
        if (date) {
            queryStr += ` AND task_date = '${date}'`;
        }

        const failedTasks = await db.all(sql.raw(queryStr));
        if (failedTasks.length === 0) return { status: "ok", count: 0 };

        const taskIds = (failedTasks as IdRow[]).map((t) => t.id);
        let deletedCount = 0;

        for (const taskId of taskIds) {
            try {
                const articles = await db.all(sql`SELECT id FROM articles WHERE generation_task_id = ${taskId}`);
                const articleIds = (articles as IdRow[]).map((a) => a.id);

                if (articleIds.length > 0) {
                    const articleIdList = articleIds.map(id => `'${id}'`).join(',');
                    await db.run(sql.raw(`DELETE FROM highlights WHERE article_id IN (${articleIdList})`));
                    await db.run(sql.raw(`DELETE FROM article_word_index WHERE article_id IN (${articleIdList})`));
                    await db.run(sql`DELETE FROM articles WHERE generation_task_id = ${taskId}`);
                }

                await db.run(sql`DELETE FROM tasks WHERE id = ${taskId}`);
                deletedCount++;
            } catch (e) {
                console.error(`Failed to delete task ${taskId}:`, e instanceof Error ? e.message : e);
            }
        }

        return { status: "ok", count: deletedCount, totalFound: taskIds.length };
    });
