import type { AppKysely } from '../../db/factory';
import type { TaskRow, ProfileRow } from '../../types/models';
import { TaskExecutor } from './executor';

/**
 * Reliable Task Queue Service (可靠任务队列服务) - Kysely Edition
 */
export class TaskQueue {
    private executor: TaskExecutor;

    constructor(private db: AppKysely) {
        this.executor = new TaskExecutor(db);
    }

    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual', llm?: string) {
        const profiles = await this.db.selectFrom('generation_profiles').selectAll().execute();

        if (profiles.length === 0) {
            const defId = crypto.randomUUID();
            const now = new Date().toISOString();
            await this.db.insertInto('generation_profiles')
                .values({
                    id: defId,
                    name: 'Default',
                    topic_preference: 'General News',
                    concurrency: 1,
                    timeout_ms: 3600000,
                    // created_at/updated_at defaults are handled by DB usually, 
                    // but here we explicit insert if needed or rely on default
                })
                .onConflict((oc) => oc.doNothing())
                .execute();
        }

        // Re-fetch profiles
        const activeProfiles = await this.db.selectFrom('generation_profiles').selectAll().execute();

        // Check daily words
        const dailyRow = await this.db.selectFrom('daily_word_references')
            .selectAll()
            .where('date', '=', taskDate)
            .limit(1)
            .execute();

        if (dailyRow.length === 0) {
            throw new Error(`No daily words found for ${taskDate}. Please fetch words first.`);
        }

        const newTasks: Array<{ id: string; profileId: string; profileName: string }> = [];

        for (const profile of activeProfiles) {
            const taskId = crypto.randomUUID();
            // Kysely defaults will handle created_at if we don't provide it, 
            // but we want consistent 'now' if multiple inserts? 
            // Actually relying on DB default is better.

            await this.db.insertInto('tasks')
                .values({
                    id: taskId,
                    task_date: taskDate,
                    type: 'article_generation',
                    trigger_source: triggerSource,
                    status: 'queued',
                    profile_id: profile.id,
                    version: 0,
                    llm: (llm as any) || null
                })
                .execute();

            newTasks.push({ id: taskId, profileId: profile.id, profileName: profile.name });
        }

        return newTasks;
    }

    async claimTask(): Promise<TaskRow | null> {
        // [1] Concurrency Check
        const runningCount = await this.db.selectFrom('tasks')
            .select((eb) => eb.fn.countAll<number>().as('count'))
            .where('status', '=', 'running')
            .executeTakeFirst();

        const count = Number(runningCount?.count || 0);

        if (count > 0) return null;

        // [2] Candidate Selection
        const candidate = await this.db.selectFrom('tasks')
            .selectAll()
            .where('status', '=', 'queued')
            .orderBy('created_at', 'asc')
            .limit(1)
            .executeTakeFirst();

        if (!candidate) return null;

        const now = new Date().toISOString();

        // [3] Optimistic Locking
        const result = await this.db.updateTable('tasks')
            .set({
                status: 'running',
                started_at: now,
                version: (eb) => eb('version', '+', 1),
                error_message: null,
                error_context_json: null
            })
            .where('id', '=', candidate.id)
            .where('status', '=', 'queued')
            .where('version', '=', candidate.version)
            .executeTakeFirst();

        // [4] Verification
        if (Number(result.numUpdatedRows) === 0) {
            // Failed to claim (beaten by another worker)
            const currentRunning = await this.db.selectFrom('tasks')
                .select((eb) => eb.fn.countAll<number>().as('count'))
                .where('status', '=', 'running')
                .executeTakeFirst();

            if (Number(currentRunning?.count || 0) > 0) return null;
            return this.claimTask(); // Recursion retry
        }

        // Return the updated task
        const updated = await this.db.selectFrom('tasks')
            .selectAll()
            .where('id', '=', candidate.id)
            .executeTakeFirst();

        return updated || null;
    }

    async complete(taskId: string, resultJson: any) {
        const now = new Date().toISOString();
        await this.db.updateTable('tasks')
            .set({
                status: 'succeeded',
                result_json: resultJson, // Auto serialized
                finished_at: now,
                published_at: now,
                error_message: null,
                error_context_json: null
            })
            .where('id', '=', taskId)
            .execute();
    }

    async fail(taskId: string, errorMessage: string, errorContext: Record<string, unknown>) {
        const now = new Date().toISOString();
        await this.db.updateTable('tasks')
            .set({
                status: 'failed',
                error_message: errorMessage,
                error_context_json: JSON.stringify(errorContext), // Manual Stringify for SQLite
                finished_at: now
            })
            .where('id', '=', taskId)
            .execute();
    }

    async processQueue() {
        const stuckTimeout = 30 * 60 * 1000;

        // [Zombie Detection]
        const runningTasks = await this.db.selectFrom('tasks')
            .select(['id', 'started_at'])
            .where('status', '=', 'running')
            .execute();

        const nowMs = Date.now();
        const stuckTasks = runningTasks.filter((t) => {
            if (!t.started_at) return false;
            const started = new Date(t.started_at).getTime();
            return (nowMs - started) > stuckTimeout;
        });

        if (stuckTasks.length > 0) {
            console.log(`[TaskQueue] Found ${stuckTasks.length} stuck tasks, resetting...`);
            for (const stuck of stuckTasks) {
                await this.db.updateTable('tasks')
                    .set((eb) => ({
                        status: 'queued',
                        started_at: null,
                        version: eb('version', '+', 1)
                    }))
                    .where('id', '=', stuck.id)
                    .execute();
                console.log(`[TaskQueue] Reset stuck task ${stuck.id}`);
            }
        } else if (runningTasks.length > 0) {
            return;
        }

        while (true) {
            const task = await this.claimTask();
            if (!task) {
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
