import { dayjs } from '../src/lib/time';
import { TaskQueue } from '../src/services/tasks/TaskQueue';
import { executeCronLogic } from '../lib/cronLogic';

const CRON_INTERVAL_MS = 60000; // Check every minute
let lastCronRunDate = '';

/**
 * Internal Cron Scheduler
 * 
 * Runs daily tasks at 09:00 CST (Asia/Shanghai).
 * Uses polling mechanism to check every minute.
 */
export function startCronScheduler(queue: TaskQueue) {
    setInterval(async () => {
        const now = dayjs();
        const hour = now.hour();
        const todayStr = now.format('YYYY-MM-DD');

        // Run between 09:00 and 10:00
        if (hour === 9) {
            if (lastCronRunDate !== todayStr) {
                console.log(`[Cron Scheduler] Triggering daily job for ${todayStr} (Hour: ${hour})`);
                try {
                    await executeCronLogic(todayStr, '[Cron Scheduler]', queue);
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
