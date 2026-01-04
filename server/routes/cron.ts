import { Elysia } from 'elysia';
import { dayjs } from '../src/lib/time';
import { TaskQueue } from '../src/services/tasks/TaskQueue';
import { executeCronLogic } from '../lib/cronLogic';

export const cronRoutes = (queue: TaskQueue) => new Elysia()
    .post('/api/cron/trigger', async () => {
        const taskDate = dayjs().format('YYYY-MM-DD');

        try {
            const res = await executeCronLogic(taskDate, '[API Cron Trigger]', queue);
            return res;
        } catch (e) {
            return { status: "error", message: e instanceof Error ? e.message : 'Unknown error' };
        }
    });
