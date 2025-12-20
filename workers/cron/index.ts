import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import { getBusinessDate, BUSINESS_TIMEZONE } from '../../src/lib/time';
import { fetchAndStoreDailyWords } from '../../src/lib/words/dailyWords';
import { enqueueGenerationTasks, startNextQueuedIfIdle } from '../../src/lib/tasks/generationQueue';
import { runArticleGenerationTask } from '../../src/lib/tasks/articleGeneration';

const GENERATION_HOURS = new Set([12, 13, 14]);

function getBusinessHour(date = new Date()) {
	const hourText = new Intl.DateTimeFormat('en-GB', {
		timeZone: BUSINESS_TIMEZONE,
		hour: '2-digit',
		hourCycle: 'h23'
	}).format(date);
	return Number(hourText);
}

type CronEnv = {
	DB: D1Database;
	SHANBAY_COOKIE: string;
	LLM_API_KEY: string;
	LLM_BASE_URL: string;
	LLM_MODEL_DEFAULT: string;
};

export default {
	async scheduled(_event: ScheduledEvent, env: CronEnv, ctx: ExecutionContext) {
		const db = drizzle(env.DB, { schema });
		const taskDate = getBusinessDate(new Date());

		try {
			const result = await fetchAndStoreDailyWords(db, {
				taskDate,
				shanbayCookie: env.SHANBAY_COOKIE
			});
			console.log(
				`[cron] fetched words: ${result.newCount} new, ${result.reviewCount} review (${result.taskDate})`
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('[cron] fetch words failed:', message);
			return;
		}

		const hour = getBusinessHour(new Date());
		if (!GENERATION_HOURS.has(hour)) return;

		try {
			const created = await enqueueGenerationTasks(db, taskDate);
			if (created.length === 0) return;

			await startNextQueuedIfIdle(db, taskDate, (taskId) => {
				const locals = { runtime: { env, ctx } } as any;
				ctx.waitUntil(runArticleGenerationTask(locals, taskId));
			});

			console.log(`[cron] enqueued ${created.length} generation task(s) for ${taskDate}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('[cron] enqueue generation failed:', message);
		}
	}
};
