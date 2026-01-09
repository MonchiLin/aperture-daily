import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import type { TaskRow, ProfileRow } from '../../types/models';
import { TaskExecutor } from './executor';

/**
 * Reliable Task Queue with optimistic locking (Raw SQL Version)
 */
export class TaskQueue {
    private executor: TaskExecutor;

    constructor(private db: AppDatabase) {
        this.executor = new TaskExecutor(db);
    }

    /**
     * Enqueue a new task for each profile
     */
    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual', llm?: string) {
        const profiles = await this.db.all(sql`SELECT * FROM generation_profiles`) as ProfileRow[];

        if (profiles.length === 0) {
            // If no profiles exist, create a default one
            const defId = crypto.randomUUID();
            const now = new Date().toISOString();
            await this.db.run(sql`
                INSERT INTO generation_profiles (id, name, topic_preference, concurrency, timeout_ms, created_at, updated_at) 
                VALUES (${defId}, 'Default', 'General News', 1, 3600000, ${now}, ${now}) 
                ON CONFLICT DO NOTHING
            `);
        }

        const activeProfiles = await this.db.all(sql`SELECT * FROM generation_profiles`) as ProfileRow[];

        const dailyRow = await this.db.all(sql`SELECT * FROM daily_word_references WHERE date = ${taskDate} LIMIT 1`);
        if (dailyRow.length === 0) {
            throw new Error(`No daily words found for ${taskDate}. Please fetch words first.`);
        }

        const newTasks: Array<{ id: string; profileId: string; profileName: string }> = [];

        for (const profile of activeProfiles) {
            const taskId = crypto.randomUUID();
            const now = new Date().toISOString();

            await this.db.run(sql`
                INSERT INTO tasks (id, task_date, type, trigger_source, status, profile_id, version, created_at, llm)
                VALUES (${taskId}, ${taskDate}, 'article_generation', ${triggerSource}, 'queued', ${profile.id}, 0, ${now}, ${llm || null})
            `);

            newTasks.push({ id: taskId, profileId: profile.id, profileName: profile.name });
        }

        return newTasks;
    }

    /**
     * Atomically claims a queued task for execution.
     */
    async claimTask(): Promise<TaskRow | null> {
        // [Optimization] Fast-exit if queue is busy (Concurrency Control)
        const runningCountRes = await this.db.all(sql`SELECT count(*) as count FROM tasks WHERE status = 'running'`) as { count: number }[];
        const runningCount = runningCountRes[0]?.count || 0;

        if (runningCount > 0) return null;

        // Find oldest queued task
        const candidates = await this.db.all(sql`
            SELECT * FROM tasks 
            WHERE status = 'queued' 
            ORDER BY created_at ASC 
            LIMIT 1
        `) as TaskRow[];

        if (candidates.length === 0) return null;

        const candidate = candidates[0]!;
        const now = new Date().toISOString();

        await this.db.run(sql`
            UPDATE tasks 
            SET status = 'running', 
                started_at = ${now}, 
                version = version + 1,
                error_message = NULL,
                error_context_json = NULL
            WHERE id = ${candidate.id} 
              AND status = 'queued' 
              AND version = ${candidate.version}
        `);

        // Verify if we won the race
        const updated = await this.db.all(sql`
            SELECT * FROM tasks 
            WHERE id = ${candidate.id} AND status = 'running' AND started_at = ${now}
            LIMIT 1
        `) as TaskRow[];

        if (updated.length === 0) {
            const currentRunningRes = await this.db.all(sql`SELECT count(*) as count FROM tasks WHERE status = 'running'`) as { count: number }[];
            if ((currentRunningRes[0]?.count || 0) > 0) return null;
            return this.claimTask();
        }

        return updated[0] ?? null;
    }

    async complete(taskId: string, resultJson: string) {
        const now = new Date().toISOString();
        await this.db.run(sql`
            UPDATE tasks 
            SET status = 'succeeded', 
                result_json = ${resultJson}, 
                finished_at = ${now}, 
                published_at = ${now},
                error_message = NULL,
                error_context_json = NULL
            WHERE id = ${taskId}
        `);
    }

    async fail(taskId: string, errorMessage: string, errorContext: Record<string, unknown>) {
        const now = new Date().toISOString();
        await this.db.run(sql`
            UPDATE tasks 
            SET status = 'failed', 
                error_message = ${errorMessage}, 
                error_context_json = ${JSON.stringify(errorContext)}, 
                finished_at = ${now} 
            WHERE id = ${taskId}
        `);
    }

    async processQueue() {
        const stuckTimeout = 30 * 60 * 1000; // 30 minutes

        const runningTasks = await this.db.all(sql`SELECT id, started_at FROM tasks WHERE status = 'running'`) as Pick<TaskRow, 'id' | 'started_at'>[];
        const nowMs = Date.now();

        const stuckTasks = runningTasks.filter((t) => {
            if (!t.started_at) return false;
            const started = new Date(t.started_at).getTime();
            return (nowMs - started) > stuckTimeout;
        });

        if (runningTasks.length > 0) console.log(`[TaskQueue] Running=${runningTasks.length}`);

        if (stuckTasks.length > 0) {
            console.log(`[TaskQueue] Found ${stuckTasks.length} stuck tasks, resetting...`);
            for (const stuck of stuckTasks) {
                await this.db.run(sql`
                    UPDATE tasks 
                    SET status = 'queued', started_at = NULL, version = version + 1 
                    WHERE id = ${stuck.id}
                `);
                console.log(`[TaskQueue] Reset stuck task ${stuck.id}`);
            }
        } else if (runningTasks.length > 0) {
            return;
        }

        while (true) {
            const task = await this.claimTask();
            if (!task) {
                if (runningTasks.length === 0) console.log(`[TaskQueue] No more tasks.`);
                break;
            }

            console.log(`[TaskQueue] Processing task ${task.id} for date ${task.task_date}`);

            try {
                await this.executor.executeTask(task);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error(`[TaskQueue] Task ${task.id} failed:`, message);
                await this.fail(task.id, message, { stage: 'execution' });
            }
        }
    }
}
