import { Elysia } from 'elysia';
import { getTodayStr } from '../src/lib/time';
import { TaskQueue } from '../src/services/tasks/queue';
import { executeCronLogic } from '../lib/cronLogic';

/**
 * Cron Trigger Route (定时任务触发器)
 * 
 * 设计意图：
 * 此端点并非“定时任务”本身，而是“定时任务的扳机”。
 * 真正的调度 (Scheduling) 由外部系统负责（如 GitHub Actions, Vercel Cron, 或 Linux Crontab）。
 * 外部系统每日定时 POST 此接口，触发内部的生成逻辑。
 */
export const cronRoutes = (queue: TaskQueue) => new Elysia()
    .post('/api/cron/trigger', async () => {
        const taskDate = getTodayStr();
        const res = await executeCronLogic(taskDate, '[API Cron Trigger]', queue);
        return res;
    });
