import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from '../../../db/schema';
import { articles, dailyWords, generationProfiles, tasks } from '../../../db/schema';
import { generateDailyNewsWithWordSelection, type CandidateWord, type GenerationCheckpoint } from '../llm/openaiCompatible';

type Db = BunSQLiteDatabase<typeof schema>;

export type TaskEnv = {
    LLM_API_KEY: string;
    LLM_BASE_URL: string;
    LLM_MODEL_DEFAULT: string;
};

function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

/**
 * Get words that have already been used in articles today
 */
async function getUsedWordsToday(db: Db, taskDate: string): Promise<Set<string>> {
    const todaysTasks = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.taskDate, taskDate));

    if (todaysTasks.length === 0) return new Set();

    const taskIds = todaysTasks.map((t) => t.id);
    const usedWords = new Set<string>();
    const taskArticles = await db
        .select({ contentJson: articles.contentJson })
        .from(articles)
        .where(inArray(articles.generationTaskId, taskIds));

    for (const article of taskArticles) {
        try {
            const content = JSON.parse(article.contentJson);
            const selected = content?.input_words?.selected;
            if (Array.isArray(selected)) {
                for (const word of selected) {
                    if (typeof word === 'string') usedWords.add(word);
                }
            }
        } catch (e) {
            // ignore JSON parse error
        }
    }

    return usedWords;
}

/**
 * Build candidate words for article generation.
 * New words are prioritized over review words.
 */
function buildCandidateWords(
    newWords: string[],
    reviewWords: string[],
    usedWords: Set<string>
): CandidateWord[] {
    const allWords = uniqueStrings([...newWords, ...reviewWords]).filter((w) => !usedWords.has(w));
    if (allWords.length === 0) return [];

    const newWordSet = new Set(newWords);
    const candidates: CandidateWord[] = [];

    for (const word of allWords) {
        const type = newWordSet.has(word) ? 'new' : 'review';
        candidates.push({ word, type });
    }

    // Sort: new words first, then review words
    candidates.sort((a, b) => {
        if (a.type === 'new' && b.type !== 'new') return -1;
        if (a.type !== 'new' && b.type === 'new') return 1;
        return 0;
    });

    return candidates;
}


/**
 * Reliable Task Queue with optimistic locking
 */
export class TaskQueue {
    constructor(private db: Db) { }

    /**
     * Enqueue a new task for each profile
     */
    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual') {
        const profiles = await this.db.select().from(generationProfiles);
        if (profiles.length === 0) {
            // If no profiles exist, create a default one
            await this.db.insert(generationProfiles).values({
                id: crypto.randomUUID(),
                name: 'Default',
                topicPreference: 'General News',
                concurrency: 1,
                timeoutMs: 3600000
            }).onConflictDoNothing();
        }

        const activeProfiles = await this.db.select().from(generationProfiles);

        const dailyRow = await this.db
            .select()
            .from(dailyWords)
            .where(eq(dailyWords.date, taskDate))
            .limit(1);

        if (dailyRow.length === 0) {
            throw new Error(`No daily words found for ${taskDate}. Please fetch words first.`);
        }

        const newTasks: Array<{ id: string; profileId: string; profileName: string }> = [];
        for (const profile of activeProfiles) {
            // Cron: Strict idempotency (one task per profile per day)
            // Skip if any task exists, regardless of status
            if (triggerSource === 'cron') {
                const existing = await this.db
                    .select({ id: tasks.id, status: tasks.status })
                    .from(tasks)
                    .where(and(
                        eq(tasks.taskDate, taskDate),
                        eq(tasks.profileId, profile.id)
                    ))
                    .limit(1);

                if (existing.length > 0) {
                    const rec = existing[0];
                    console.log(`[TaskQueue][Cron] Task exists for ${profile.name} (${rec.status}), skipping.`);
                    continue;
                }
            }

            // Manual: Allow duplicate/multiple tasks (always create new)

            const taskId = crypto.randomUUID();
            await this.db.insert(tasks).values({
                id: taskId,
                taskDate,
                type: 'article_generation',
                triggerSource,
                status: 'queued',
                profileId: profile.id,
                version: 0
            });
            newTasks.push({ id: taskId, profileId: profile.id, profileName: profile.name });
        }

        return newTasks;
    }

    /**
     * Atomically claim a queued task using optimistic locking
     * Returns the claimed task or null if none available
     * Global queue - processes tasks from any date
     */
    async claimTask(): Promise<typeof tasks.$inferSelect | null> {
        // [Optimization] Check if queue is busy before querying candidates
        // This reduces write contention on the tasks table
        const runningCount = await this.db
            .select({ count: sql<number>`count(*)` })
            .from(tasks)
            .where(eq(tasks.status, 'running'))
            .then(res => res[0].count);

        if (runningCount > 0) return null;

        // Find oldest queued task (any date)
        const candidates = await this.db
            .select()
            .from(tasks)
            .where(eq(tasks.status, 'queued'))
            .orderBy(tasks.createdAt)
            .limit(1);

        if (candidates.length === 0) return null;

        const candidate = candidates[0];
        const now = new Date().toISOString();

        // Attempt to claim with optimistic lock AND global serial lock
        // Ensure no other task is 'running' at the exact moment of update
        await this.db
            .update(tasks)
            .set({
                status: 'running',
                startedAt: now,
                version: sql`${tasks.version} + 1`
            })
            .where(and(
                eq(tasks.id, candidate.id),
                eq(tasks.status, 'queued'),
                eq(tasks.version, candidate.version),
                // Atomic Lock: Enforce serial execution
                sql`(SELECT count(*) FROM ${tasks} WHERE ${tasks.status} = 'running') = 0`
            ));

        // Re-query to verify we got it
        const updated = await this.db
            .select()
            .from(tasks)
            .where(and(
                eq(tasks.id, candidate.id),
                eq(tasks.status, 'running')
            ))
            .limit(1);

        if (updated.length === 0) {
            // Update failed. Could be:
            // 1. Someone else claimed THIS task (optimistic lock fail)
            // 2. Someone else claimed ANOTHER task (global lock fail)

            // Check if queue is now busy
            const currentRunning = await this.db
                .select({ count: sql<number>`count(*)` })
                .from(tasks)
                .where(eq(tasks.status, 'running'))
                .then(res => res[0].count);

            if (currentRunning > 0) {
                // Queue is busy, back off
                return null;
            }

            // Queue is free but we missed this task? Try again (recursion)
            return this.claimTask();
        }

        return updated[0];
    }

    /**
     * Mark task as succeeded
     */
    async complete(taskId: string, resultJson: string) {
        const now = new Date().toISOString();
        await this.db
            .update(tasks)
            .set({
                status: 'succeeded',
                resultJson,
                finishedAt: now,
                publishedAt: now
            })
            .where(eq(tasks.id, taskId));
    }

    /**
     * Mark task as failed
     */
    async fail(taskId: string, errorMessage: string, errorContext: Record<string, unknown>) {
        await this.db
            .update(tasks)
            .set({
                status: 'failed',
                errorMessage,
                errorContextJson: JSON.stringify(errorContext),
                finishedAt: new Date().toISOString()
            })
            .where(eq(tasks.id, taskId));
    }

    /**
     * Process the global queue - claim and execute all pending tasks
     */
    async processQueue(env: TaskEnv) {
        console.log(`[TaskQueue] Starting global queue processing`);

        // Auto-recover stuck tasks (running for more than 2 minutes)
        const stuckTimeout = 2 * 60 * 1000; // 2 minutes
        const cutoffTime = new Date(Date.now() - stuckTimeout).toISOString();

        const runningTasks = await this.db
            .select({ id: tasks.id, startedAt: tasks.startedAt })
            .from(tasks)
            .where(eq(tasks.status, 'running'));

        const stuckTasks = runningTasks.filter(t => t.startedAt && t.startedAt < cutoffTime);

        if (runningTasks.length > 0) {
            console.log(`[TaskQueue] Running=${runningTasks.length}`);
        }

        if (stuckTasks.length > 0) {
            console.log(`[TaskQueue] Found ${stuckTasks.length} stuck tasks, resetting to queued...`);
            for (const stuck of stuckTasks) {
                await this.db
                    .update(tasks)
                    .set({
                        status: 'queued',
                        startedAt: null,
                        version: sql`${tasks.version} + 1`
                    })
                    .where(eq(tasks.id, stuck.id));
                console.log(`[TaskQueue] Reset stuck task ${stuck.id}`);
            }
        } else if (runningTasks.length > 0) {
            console.log(`[TaskQueue] Queue is busy (${runningTasks.length} running), skipping to enforce serial execution.`);
            return;
        }

        while (true) {
            // Claim next task (global, any date)
            const task = await this.claimTask();
            if (!task) {
                if (runningTasks.length === 0) {
                    console.log(`[TaskQueue] No more tasks to process`);
                }
                break;
            }

            console.log(`[TaskQueue] Processing task ${task.id} for date ${task.taskDate}`);

            try {
                await this.executeTask(env, task);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[TaskQueue] Task ${task.id} failed:`, message);
                await this.fail(task.id, message, { stage: 'execution' });
            }
        }
    }

    /**
     * Execute a single task
     */
    private async executeTask(env: TaskEnv, task: typeof tasks.$inferSelect) {
        const profile = await this.db
            .select()
            .from(generationProfiles)
            .where(eq(generationProfiles.id, task.profileId))
            .limit(1)
            .then(rows => rows[0]);

        if (!profile) {
            throw new Error(`Profile not found: ${task.profileId}`);
        }

        const dailyRow = await this.db
            .select()
            .from(dailyWords)
            .where(eq(dailyWords.date, task.taskDate))
            .limit(1)
            .then(rows => rows[0]);

        if (!dailyRow) {
            throw new Error('No daily words found');
        }

        const dailyNew = dailyRow.newWordsJson ? JSON.parse(dailyRow.newWordsJson) : [];
        const dailyReview = dailyRow.reviewWordsJson ? JSON.parse(dailyRow.reviewWordsJson) : [];
        const newWords = uniqueStrings(Array.isArray(dailyNew) ? dailyNew : []);
        const reviewWords = uniqueStrings(Array.isArray(dailyReview) ? dailyReview : []);

        if (newWords.length + reviewWords.length === 0) {
            throw new Error('Daily words record is empty');
        }

        const usedWords = await getUsedWordsToday(this.db, task.taskDate);
        const candidates = buildCandidateWords(newWords, reviewWords, usedWords);

        if (candidates.length === 0) {
            throw new Error('All words have been used today');
        }

        const model = env.LLM_MODEL_DEFAULT;
        if (!model) {
            throw new Error('LLM_MODEL_DEFAULT environment variable is required');
        }

        console.log(`[Task ${task.id}] Starting LLM generation with model: ${model}`);

        // Checkpoint Recovery:
        // If the task has a saved 'resultJson' containing a stage, we resume from there.
        let checkpoint: GenerationCheckpoint | null = null;
        if (task.resultJson) {
            try {
                const parsed = JSON.parse(task.resultJson);
                if (parsed.stage && parsed.history) {
                    checkpoint = parsed as GenerationCheckpoint;
                    console.log(`[Task ${task.id}] Resuming from checkpoint: ${checkpoint.stage}`);
                }
            } catch (e) {
                console.error(`[Task ${task.id}] Failed to parse checkpoint:`, e);
            }
        }

        const output = await generateDailyNewsWithWordSelection({
            env,
            model,
            currentDate: task.taskDate,
            topicPreference: profile.topicPreference,
            candidateWords: candidates,
            checkpoint,
            onCheckpoint: async (cp) => {
                await this.db
                    .update(tasks)
                    .set({ resultJson: JSON.stringify(cp) })
                    .where(eq(tasks.id, task.id));
                console.log(`[Task ${task.id}] Saved checkpoint: ${cp.stage}`);
            }
        });

        const articleId = crypto.randomUUID();
        const contentData = {
            schema: 'daily_news_v2',
            task_date: task.taskDate,
            topic_preference: profile.topicPreference,
            input_words: {
                new: newWords,
                review: reviewWords,
                candidates: candidates.map((c) => c.word),
                selected: output.selectedWords
            },
            word_usage_check: output.output.word_usage_check,
            result: output.output
        };

        const finishedAt = new Date().toISOString();
        const resultData = {
            new_count: newWords.length,
            review_count: reviewWords.length,
            candidate_count: candidates.length,
            selected_words: output.selectedWords,
            generated: { model, article_id: articleId },
            usage: output.usage ?? null
        };

        await this.db.insert(articles).values({
            id: articleId,
            generationTaskId: task.id,
            model,
            variant: 1,
            title: output.output.title,
            contentJson: JSON.stringify(contentData),
            status: 'published',
            publishedAt: finishedAt
        });

        await this.db
            .update(tasks)
            .set({
                status: 'succeeded',
                resultJson: JSON.stringify(resultData),
                finishedAt,
                publishedAt: finishedAt
            })
            .where(eq(tasks.id, task.id));

        console.log(`[Task ${task.id}] Completed successfully`);
    }
}
