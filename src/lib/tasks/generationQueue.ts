import { and, eq, lt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '../../../db/schema';
import { dailyWords, generationProfiles, tasks } from '../../../db/schema';

type Db = DrizzleD1Database<typeof schema>;

// Timeout for stale running tasks (10 minutes)
const STALE_TASK_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_DAILY_ATTEMPTS_PER_PROFILE = 3;

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

	const existing = await db
		.select({ profileId: tasks.profileId, status: tasks.status })
		.from(tasks)
		.where(and(eq(tasks.taskDate, taskDate), eq(tasks.type, 'article_generation')));

	const attemptsByProfile = new Map<string, number>();
	const succeededProfiles = new Set<string>();
	for (const row of existing) {
		attemptsByProfile.set(row.profileId, (attemptsByProfile.get(row.profileId) ?? 0) + 1);
		if (row.status === 'succeeded') succeededProfiles.add(row.profileId);
	}

	// Cleanup stale running tasks (running for more than 10 minutes)
	const staleThreshold = new Date(Date.now() - STALE_TASK_TIMEOUT_MS).toISOString();
	await db
		.update(tasks)
		.set({
			status: 'failed',
			errorMessage: 'Task timed out (exceeded 10 minutes)',
			finishedAt: new Date().toISOString()
		})
		.where(
			and(
				eq(tasks.taskDate, taskDate),
				eq(tasks.status, 'running'),
				lt(tasks.startedAt, staleThreshold)
			)
		);

	const created: Array<{ id: string; profile_id: string }> = [];
	const inserts = [];
	for (const p of profiles) {
		if (succeededProfiles.has(p.id)) continue;
		if ((attemptsByProfile.get(p.id) ?? 0) >= MAX_DAILY_ATTEMPTS_PER_PROFILE) continue;
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

	await db.batch(inserts as [any, ...any[]]);
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
