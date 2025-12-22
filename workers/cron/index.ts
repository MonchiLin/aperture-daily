import { drizzle } from 'drizzle-orm/d1';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import * as schema from '../../db/schema';
import { fetchAndStoreDailyWords } from '../../src/lib/words/dailyWords';
import { enqueueGenerationTasks, startNextQueuedIfIdle } from '../../src/lib/tasks/generationQueue';
import { runArticleGenerationTask } from '../../src/lib/tasks/articleGeneration';

dayjs.extend(utc);
dayjs.extend(timezone);

const TJ_TIMEZONE = 'Asia/Shanghai';

type CronEnv = {
	DB: D1Database;
	SHANBAY_COOKIE: string;
	[key: string]: unknown; // 允许其他环境变量
};

export default {
	async scheduled(event: ScheduledEvent, env: CronEnv, ctx: ExecutionContext) {
		const db = drizzle(env.DB, { schema });
		const now = dayjs().tz(TJ_TIMEZONE);
		const taskDate = now.format('YYYY-MM-DD');
		const hour = now.hour();
		const minute = now.minute(); // 获取分钟 (0-59)

		console.log(`[cron] Triggered at ${now.format('YYYY-MM-DD HH:mm:ss')} (Asia/Shanghai)`);

		// === 1. Fetch Words (每天 10:00) ===
		// 允许整个 10 点的小时窗口，抓取函数内部有幂等处理。
		if (hour === 10) {
			try {
				const result = await fetchAndStoreDailyWords(db, {
					taskDate,
					shanbayCookie: env.SHANBAY_COOKIE
				});
				console.log(
					`[cron] fetched words: ${result.newCount} new, ${result.reviewCount} review (${result.taskDate})`
				);
			} catch (err) {
				console.error('[cron] fetch words failed:', err);
			}
		}

		// === 2. Generate Tasks (11:00 - 15:00) ===
		// 每半小时检查一次。
		// Cron: */30 3-7 * * * (UTC 03:00 - 07:00 => Beijing 11:00 - 15:00)
		// 15:00 是最后一次。如果在 15:30 触发 (虽然 15:00 UTC 是 7:00, 7:30 也是 7 range?), 
		// "直到下午三点" 通常意味着 15:00 结束。如果 15:30 触发了，minute 也就是 30。
		// 我们限制：如果 hour 为 15 且 minute > 10，则不执行。确保只在 15:00 这一刻执行。
		// 注意 dayjs.minute() 返回 0-59。
		const isTaskTime = (hour >= 11 && hour < 15) || (hour === 15 && minute < 10);

		if (isTaskTime) {
			console.log(`[cron] Running generation scheduler for ${taskDate}`);
			try {
				// 1. 确保任务已入队（幂等）
				// 注意：如果 10 点抓词失败了，这里会抛错 "No daily words found"，符合预期（快速失败）。
				await enqueueGenerationTasks(db, taskDate);

				// 2. 如果当前空闲，点火运行
				await startNextQueuedIfIdle(db, taskDate, (taskId) => {
					console.log(`[cron] Starting task ${taskId}`);
					// 使用 ctx.waitUntil 确保 worker 不会过早关闭
					ctx.waitUntil(
						runArticleGenerationTask(env as any, db, taskId).catch((err) => {
							console.error(`[cron] Task ${taskId} failed:`, err);
						})
					);
				});
			} catch (err) {
				console.error('[cron] Generation scheduler failed:', err);
			}
		}
	}
};
