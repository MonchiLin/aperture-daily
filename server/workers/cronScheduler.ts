import { dayjs } from '../src/lib/time';
import { TaskQueue } from '../src/services/tasks/TaskQueue';
import { runDailyWordFetch, runTaskEnqueue } from '../lib/cronLogic';

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
        // Use .tz() to ensure we are always checking against Asia/Shanghai
        const now = dayjs().tz('Asia/Shanghai');
        const hour = now.hour();
        const minute = now.minute();
        const todayStr = now.format('YYYY-MM-DD');

        // 1. Daily Word Fetch at 08:00 window (08:00 - 08:59)
        if (hour === 8) {
            const slotKey = `${todayStr}_fetch_0800`;
            if (lastCronRunDate !== slotKey) {
                console.log(`[Cron Scheduler][CST] Triggering Daily Word Fetch (08:00 Window)`);
                try {
                    await runDailyWordFetch(todayStr, '[Cron 08:00]');
                    lastCronRunDate = slotKey;
                } catch (e) {
                    console.error('[Cron Scheduler] 08:00 Fetch failed', e);
                }
            }
        }

        // 2. Article Generation (09:00 - 17:00)
        // Robust Slot-based Trigger: Find the current 30-minute slot (e.g., 10:45 -> 10:30 slot)
        if (hour >= 9 && hour <= 17) {
            const currentSlotMinute = Math.floor(minute / 30) * 30;
            const slotKey = `${todayStr}_gen_${hour}_${currentSlotMinute}`;

            if (lastCronRunDate !== slotKey) {
                console.log(`[Cron Scheduler][CST] Triggering Article Generation Slot (${hour}:${currentSlotMinute.toString().padStart(2, '0')})`);
                try {
                    await runTaskEnqueue(todayStr, `[Cron ${hour}:${currentSlotMinute}]`, queue);
                    lastCronRunDate = slotKey;
                } catch (e) {
                    console.error(`[Cron Scheduler] Generation task failed`, e);
                }
            }
        }
    }, CRON_INTERVAL_MS);
    console.log("[Cron Scheduler] Started. Target window: 09:00 - 17:00 CST (Robust Frequency: 30min)");
}
