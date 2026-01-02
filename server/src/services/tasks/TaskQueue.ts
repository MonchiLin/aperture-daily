import { sql } from 'drizzle-orm';
import { generateDailyNews3StageWithGemini } from '../llm/geminiPipeline3';
import type { CandidateWord, GeminiCheckpoint3 } from '../llm/types';
import { indexArticleWords } from '../wordIndexer';

// Interface for loose typing since we are using raw SQL
interface Db {
    all: (query: any) => Promise<any[]>;
    run: (query: any) => Promise<any>;
}

export type TaskEnv = {
    GEMINI_API_KEY: string;
    GEMINI_BASE_URL: string;  // Always has a value (defaults to empty string)
    LLM_MODEL_DEFAULT: string;
};

function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

/**
 * Get words that have already been used in articles today
 */
async function getUsedWordsToday(db: Db, taskDate: string): Promise<Set<string>> {
    // Get task IDs for date
    const todaysTasks = await db.all(sql`SELECT id FROM tasks WHERE task_date = ${taskDate}`);
    if (todaysTasks.length === 0) return new Set();

    const taskIds = todaysTasks.map((t) => t.id);
    const placeholders = taskIds.map(() => '?').join(',');

    // Manual IN clause for raw SQL safely
    // Since IDs are trusted UUIDs, we can inject, but safer to use param array if possible.
    // D1 Proxy simple mode usually requires literal injection for arrays or loops.
    // Let's use literal injection for UUIDs as they are safe characters.
    const inClause = taskIds.map(id => `'${id}'`).join(',');

    // Fetch article content
    const taskArticles = await db.all(sql.raw(`SELECT content_json FROM articles WHERE generation_task_id IN (${inClause})`));

    const usedWords = new Set<string>();
    for (const article of taskArticles) {
        try {
            const content = JSON.parse(article.content_json);
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

    candidates.sort((a, b) => {
        if (a.type === 'new' && b.type !== 'new') return -1;
        if (a.type !== 'new' && b.type === 'new') return 1;
        return 0;
    });

    return candidates;
}


/**
 * Reliable Task Queue with optimistic locking (Raw SQL Version)
 */
export class TaskQueue {
    constructor(private db: Db) { }

    /**
     * Enqueue a new task for each profile
     */
    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual') {
        const profiles = await this.db.all(sql`SELECT * FROM generation_profiles`);

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

        const activeProfiles = await this.db.all(sql`SELECT * FROM generation_profiles`);

        const dailyRow = await this.db.all(sql`SELECT * FROM daily_words WHERE date = ${taskDate} LIMIT 1`);
        if (dailyRow.length === 0) {
            throw new Error(`No daily words found for ${taskDate}. Please fetch words first.`);
        }

        const newTasks: Array<{ id: string; profileId: string; profileName: string }> = [];

        for (const profile of activeProfiles) {
            if (triggerSource === 'cron') {
                const existing = await this.db.all(sql`
                    SELECT id, status FROM tasks 
                    WHERE task_date = ${taskDate} AND profile_id = ${profile.id} 
                    LIMIT 1
                `);

                if (existing.length > 0) {
                    console.log(`[TaskQueue][Cron] Task exists for ${profile.name} (${existing[0].status}), skipping.`);
                    continue;
                }
            }

            const taskId = crypto.randomUUID();
            const now = new Date().toISOString();

            await this.db.run(sql`
                INSERT INTO tasks (id, task_date, type, trigger_source, status, profile_id, version, created_at)
                VALUES (${taskId}, ${taskDate}, 'article_generation', ${triggerSource}, 'queued', ${profile.id}, 0, ${now})
            `);

            newTasks.push({ id: taskId, profileId: profile.id, profileName: profile.name });
        }

        return newTasks;
    }

    /**
     * Atomically claims a queued task for execution.
     * 
     * Mechanism: Optimistic Locking via Versioning.
     * 1. Finds the oldest 'queued' task.
     * 2. Attempts to update its status to 'running' ONLY if the version matches.
     * 3. Increments the version to invalidate other concurrent claims.
     * 
     * This ensures multiple workers (or threads) never pick up the same task.
     */
    async claimTask(): Promise<any | null> {
        // [Optimization] Fast-exit if queue is busy (Concurrency Control)
        const runningCountRes = await this.db.all(sql`SELECT count(*) as count FROM tasks WHERE status = 'running'`);
        const runningCount = runningCountRes[0]?.count || 0;

        if (runningCount > 0) return null;

        // Find oldest queued task
        const candidates = await this.db.all(sql`
            SELECT * FROM tasks 
            WHERE status = 'queued' 
            ORDER BY created_at ASC 
            LIMIT 1
        `);

        if (candidates.length === 0) return null;

        const candidate = candidates[0];
        const now = new Date().toISOString();

        // Attempt optimistic lock update
        // Using raw SQL logic: UPDATE ... WHERE id=? AND version=?
        // NOTE: Drizzle proxy .run() might not return 'changes' count reliably across all drivers.
        // We will perform the update, then check if it stuck.

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
        `);

        if (updated.length === 0) {
            // Update failed (race condition).
            // Check if queue busy now
            const currentRunningRes = await this.db.all(sql`SELECT count(*) as count FROM tasks WHERE status = 'running'`);
            if ((currentRunningRes[0]?.count || 0) > 0) return null;

            // Try again
            return this.claimTask();
        }

        return updated[0];
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

    async processQueue(env: TaskEnv) {
        // console.log(`[TaskQueue] Starting global queue processing`);

        const stuckTimeout = 2 * 60 * 1000; // 2 minutes
        // We need to parse ISO dates in JS to compare, or trust SQL comparison if formats match.
        // Let's filter in JS to be safe with string dates.

        const runningTasks = await this.db.all(sql`SELECT id, started_at FROM tasks WHERE status = 'running'`);
        const nowMs = Date.now();

        const stuckTasks = runningTasks.filter((t: any) => {
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
                // Must map snake_case task props to camelCase if needed by logic?
                // Or just update internal logic to use snake_case task properties. 
                // Let's coerce task to any for easy access.
                await this.executeTask(env, task);
            } catch (err: any) {
                console.error(`[TaskQueue] Task ${task.id} failed:`, err.message);
                await this.fail(task.id, err.message, { stage: 'execution' });
            }
        }
    }

    private async executeTask(env: TaskEnv, task: any) {
        const profileRes = await this.db.all(sql`SELECT * FROM generation_profiles WHERE id = ${task.profile_id} LIMIT 1`);
        const profile = profileRes[0];

        if (!profile) throw new Error(`Profile not found: ${task.profile_id}`);

        const dailyRowRes = await this.db.all(sql`SELECT * FROM daily_words WHERE date = ${task.task_date} LIMIT 1`);
        const dailyRow = dailyRowRes[0];

        if (!dailyRow) throw new Error('No daily words found');

        const dailyNew = dailyRow.new_words_json ? JSON.parse(dailyRow.new_words_json) : [];
        const dailyReview = dailyRow.review_words_json ? JSON.parse(dailyRow.review_words_json) : [];
        const newWords = uniqueStrings(Array.isArray(dailyNew) ? dailyNew : []);
        const reviewWords = uniqueStrings(Array.isArray(dailyReview) ? dailyReview : []);

        if (newWords.length + reviewWords.length === 0) throw new Error('Daily words record is empty');

        const usedWords = await getUsedWordsToday(this.db, task.task_date);
        const candidates = buildCandidateWords(newWords, reviewWords, usedWords);

        if (candidates.length === 0) throw new Error('All words have been used today');

        const model = env.LLM_MODEL_DEFAULT;
        if (!model) throw new Error('LLM_MODEL_DEFAULT environment variable is required');

        console.log(`[Task ${task.id}] Starting LLM generation with model: ${model}`);

        // Checkpoint Resumption Logic (三阶段版)
        // If the task previously failed mid-execution, it may have saved a checkpoint in `result_json`.
        // We restore the state to avoid re-doing expensive steps.
        let checkpoint: GeminiCheckpoint3 | null = null;
        if (task.result_json) {
            try {
                const parsed = JSON.parse(task.result_json);
                // 只接受三阶段的合法 stage 值
                const validStages = ['search_selection', 'draft', 'conversion'];
                if (parsed && typeof parsed === 'object' && 'stage' in parsed && validStages.includes(parsed.stage)) {
                    checkpoint = parsed as GeminiCheckpoint3;
                    console.log(`[Task ${task.id}] Resuming from checkpoint: ${checkpoint.stage}`);
                } else if (parsed && typeof parsed === 'object' && 'stage' in parsed) {
                    // 旧的四阶段 checkpoint（word_selection, research, draft, conversion）
                    console.warn(`[Task ${task.id}] Found old 4-stage checkpoint (${parsed.stage}), ignoring and starting fresh.`);
                }
            } catch (e) {
                console.warn(`[Task ${task.id}] Failed to parse checkpoint, starting fresh.`);
            }
        }

        // 将 CandidateWord[] 转换为 string[]
        const candidateWordStrings = candidates.map(c => c.word);

        const output = await generateDailyNews3StageWithGemini({
            env: { GEMINI_API_KEY: env.GEMINI_API_KEY, GEMINI_BASE_URL: env.GEMINI_BASE_URL },
            model,
            currentDate: task.task_date,
            topicPreference: profile.topic_preference,
            candidateWords: candidateWordStrings,
            checkpoint,
            onCheckpoint: async (cp) => {
                await this.db.run(sql`UPDATE tasks SET result_json = ${JSON.stringify(cp)} WHERE id = ${task.id}`);
                console.log(`[Task ${task.id}] Saved checkpoint: ${cp.stage}`);
            }
        });

        const articleId = crypto.randomUUID();
        const contentData = {
            schema: 'daily_news_v2',
            task_date: task.task_date,
            topic_preference: profile.topic_preference,
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

        await this.db.run(sql`
            INSERT INTO articles (id, generation_task_id, model, variant, title, content_json, status, published_at)
            VALUES (${articleId}, ${task.id}, ${model}, 1, ${output.output.title}, ${JSON.stringify(contentData)}, 'published', ${finishedAt})
        `);

        // [Semantic Weaving] Index words for memory recall
        try {
            await indexArticleWords(articleId, contentData);
        } catch (e) {
            console.error(`[Task ${task.id}] Failed to index words:`, e);
        }


        await this.db.run(sql`
            UPDATE tasks 
            SET status = 'succeeded', 
                result_json = ${JSON.stringify(resultData)}, 
                finished_at = ${finishedAt}, 
                published_at = ${finishedAt} 
            WHERE id = ${task.id}
        `);

        console.log(`[Task ${task.id}] Completed successfully`);
    }
}
