import { Elysia } from 'elysia';
import { dayjs } from '../src/lib/time';
import { TaskQueue } from '../src/services/tasks/TaskQueue';
import { executeCronLogic } from '../lib/cronLogic';

export const cronRoutes = (queue: TaskQueue) => new Elysia()
    .post('/api/cron/trigger', async () => {
        const taskDate = dayjs().format('YYYY-MM-DD');
        const res = await executeCronLogic(taskDate, '[API Cron Trigger]', queue);
        return res;
    });
