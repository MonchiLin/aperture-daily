import { Elysia } from 'elysia';
import { dayjs } from '../src/lib/time';
import { TaskQueue } from '../src/services/tasks/TaskQueue';
import { executeCronLogic } from '../lib/cronLogic';
import { env } from '../config/env';

export const cronRoutes = (queue: TaskQueue) => new Elysia()
    .post('/api/cron/trigger', async ({ request, error }: any) => {
        const key = request.headers.get ? request.headers.get('x-admin-key') : request.headers['x-admin-key'];
        if (key !== env.ADMIN_KEY) return error(401, { error: "Unauthorized" });

        const taskDate = dayjs().format('YYYY-MM-DD');

        try {
            const res = await executeCronLogic(taskDate, '[API Cron Trigger]', queue);
            return res;
        } catch (e: any) {
            return { status: "error", message: e.message };
        }
    });
