import { and, eq, inArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../../db/schema';
import { dailyWords, generationProfiles, tasks } from '../../../db/schema';

type Db = DrizzleD1Database<typeof schema>;

// 超时缓冲：避免刚好卡在边界时被过早清理。
const STALE_TASK_BUFFER_MS = 2 * 60 * 1000;

export async function ensureDailyWords(db: Db, taskDate: string) {
	const rows = await db.select({ date: dailyWords.date }).from(dailyWords).where(eq(dailyWords.date, taskDate)).limit(1);
	return rows[0] ?? null;
}

export async function enqueueGenerationTasks(db: Db, taskDate: string) {
	const daily = await ensureDailyWords(db, taskDate);
	if (!daily) {
		throw new Error('No daily words found. Fetch words first.');
	}

	const profiles = await db.select({ id: generationProfiles.id }).from(generationProfiles).orderBy(generationProfiles.createdAt);
	if (profiles.length === 0) {
		throw new Error('No generation profile found. Create one first.');
	}

	// 幂等性检查：如果今日已有生成任务（无论什么状态），则视为已入队，不再重复创建。
	const existing = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(eq(tasks.taskDate, taskDate), eq(tasks.type, 'article_generation')))
		.limit(1);

	if (existing.length > 0) {
		console.log(`[Queue] Tasks for ${taskDate} already exist. Skipping enqueue.`);
		return [];
	}



	// 清理超时的 running 任务（按 profile.timeout_ms 判断）。
	const running = await db
		.select({ id: tasks.id, startedAt: tasks.startedAt, profileId: tasks.profileId })
		.from(tasks)
		.where(and(eq(tasks.taskDate, taskDate), eq(tasks.status, 'running')));
	if (running.length > 0) {
		const profileIds = Array.from(new Set(running.map((t) => t.profileId)));
		const profileRows = await db
			.select({ id: generationProfiles.id, timeoutMs: generationProfiles.timeoutMs })
			.from(generationProfiles)
			.where(inArray(generationProfiles.id, profileIds));
		const timeoutByProfile = new Map(profileRows.map((p) => [p.id, p.timeoutMs]));
		const nowMs = Date.now();
		const updates: any[] = [];
		for (const t of running) {
			if (!t.startedAt) continue;
			const startedMs = Date.parse(t.startedAt);
			if (Number.isNaN(startedMs)) continue;
			const timeoutMs = timeoutByProfile.get(t.profileId);
			if (!timeoutMs) continue;
			if (nowMs - startedMs > timeoutMs + STALE_TASK_BUFFER_MS) {
				updates.push(
					db
						.update(tasks)
						.set({
							status: 'failed',
							errorMessage: 'Task timed out (exceeded profile timeout)',
							finishedAt: new Date().toISOString()
						})
						.where(eq(tasks.id, t.id))
				);
			}
		}
		if (updates.length > 0) {
			await db.batch(updates as [any, ...any[]]);
		}
	}

	// 为每个 profile 创建任务（不限制次数）。
	const created: Array<{ id: string; profile_id: string }> = [];
	const inserts = [];
	for (const p of profiles) {
		const id = crypto.randomUUID();
		created.push({ id, profile_id: p.id });
		inserts.push(
			db.insert(tasks).values({
				id,
				taskDate,
				type: 'article_generation',
				triggerSource: 'manual',
				status: 'queued',
				profileId: p.id
			})
		);
	}

	if (inserts.length > 0) {
		await db.batch(inserts as [any, ...any[]]);
	}
	return created;
}

export async function startNextQueuedIfIdle(
	db: Db,
	taskDate: string,
	startTask: (taskId: string) => void
) {
	const runningTasks = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(eq(tasks.taskDate, taskDate), eq(tasks.status, 'running')))
		.limit(1);

	if (runningTasks.length > 0) return;

	const queued = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(eq(tasks.taskDate, taskDate), eq(tasks.status, 'queued')))
		.orderBy(tasks.createdAt)
		.limit(1);

	if (queued.length > 0) startTask(queued[0].id);
}
