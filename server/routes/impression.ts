/**
 * IMPRESSION 路由模块
 *
 * 提供 IMPRESSION 功能的 API 端点：从词库随机选词生成自由创作文章
 */
import { Elysia, t } from 'elysia';
import { TaskQueue } from '../src/services/tasks/queue';

export const impressionRoutes = (queue: TaskQueue) =>
    new Elysia({ prefix: '/api/impression' })
        .post(
            '/generate',
            async ({ body }) => {
                const { task_date, llm, word_count } = body;
                const tasks = await queue.enqueueImpression(
                    task_date,
                    word_count ?? 1024,
                    llm ?? undefined
                );
                return { status: 'ok', tasks };
            },
            {
                body: t.Object({
                    task_date: t.String(),
                    llm: t.Optional(t.String()),
                    word_count: t.Optional(t.Number({ minimum: 1, maximum: 1024 }))
                })
            }
        );
