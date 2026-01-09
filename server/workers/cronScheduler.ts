import { dayjs } from '../src/lib/time';
import { TaskQueue } from '../src/services/tasks/queue';
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

        // 1. Daily Word Fetch at 06:00 window (06:00 - 06:30)
        if (hour === 6 && minute <= 30) {
            const currentSlotMinute = Math.floor(minute / 10) * 10;
            const slotKey = `${todayStr}_fetch_0600_${currentSlotMinute}`;
            if (lastCronRunDate !== slotKey) {
                console.log(`[Cron Scheduler][CST] Triggering Daily Word Fetch (06:00 Window, Slot: ${currentSlotMinute})`);
                try {
                    await runDailyWordFetch(todayStr, '[Cron 06:00]');
                    lastCronRunDate = slotKey;
                } catch (e) {
                    console.error('[Cron Scheduler] 06:00 Fetch failed', e);
                }
            }
        }

        // 2. Article Generation (07:00 - 12:00)
        // Robust Slot-based Trigger: Hourly trigger
        if (hour >= 7 && hour <= 12) {
            const slotKey = `${todayStr}_gen_${hour}`;

            if (lastCronRunDate !== slotKey) {
                console.log(`[Cron Scheduler][CST] Triggering Article Generation Slot (${hour}:00)`);
                try {
                    await runTaskEnqueue(todayStr, `[Cron ${hour}:00]`, queue);
                    lastCronRunDate = slotKey;
                } catch (e) {
                    console.error(`[Cron Scheduler] Generation task failed`, e);
                }
            }
        }
    }, CRON_INTERVAL_MS);
    console.log("[Cron Scheduler] Started. Target: Fetch 06:00 (10m freq), Gen 07:00-12:00 (1h freq)");
}
