import { sql } from 'drizzle-orm';
import { articleVariants, articleVocabulary, articleVocabDefinitions } from '../../../db/schema';
import { generateDailyNews3StageWithGemini } from '../llm/geminiPipeline3';
import type { CandidateWord, GeminiCheckpoint3 } from '../llm/types';
import { indexArticleWords } from '../wordIndexer';
import type { AppDatabase } from '../../db/client';
import type { TaskRow, ProfileRow, IdRow } from '../../types/models';

export type TaskEnv = {
    GEMINI_API_KEY: string;
    GEMINI_BASE_URL: string;
    LLM_MODEL_DEFAULT: string;
};

function uniqueStrings(input: string[]) {
    return Array.from(new Set(input.filter((x) => typeof x === 'string' && x.length > 0)));
}

/**
 * Get words that have already been used in articles today
 */
async function getUsedWordsToday(db: AppDatabase, taskDate: string): Promise<Set<string>> {
    const rows = await db.all(sql`
        SELECT DISTINCT v.word 
        FROM tasks t
        JOIN articles a ON a.generation_task_id = t.id
        JOIN article_vocabulary v ON v.article_id = a.id
        WHERE t.task_date = ${taskDate}
    `) as { word: string }[];

    return new Set(rows.map(r => r.word));
}

/**
 * Get recent article titles to avoid topic repetition
 */
async function getRecentTitles(db: AppDatabase, taskDate: string, days: number = 3): Promise<string[]> {
    const rows = await db.all(sql`
        SELECT DISTINCT a.title
        FROM tasks t
        JOIN articles a ON a.generation_task_id = t.id
        WHERE t.status = 'succeeded'
          AND t.task_date >= date(${taskDate}, '-' || ${days} || ' days')
          AND t.task_date < ${taskDate}
    `) as { title: string }[];

    return rows.map(r => r.title).filter(Boolean);
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
    constructor(private db: AppDatabase) { }

    /**
     * Enqueue a new task for each profile
     */
    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual') {
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
            // [Requirement Change] Allow multiple cron tasks per day.
            // Logic removed to support multiple article generations daily.
            /*
            if (triggerSource === 'cron') {
                const existing = await this.db.all(sql`
                    SELECT id, status FROM tasks 
                    WHERE task_date = ${taskDate} AND profile_id = ${profile.id} 
                    LIMIT 1
                `) as Pick<TaskRow, 'id' | 'status'>[];

                if (existing.length > 0) {
                    console.log(`[TaskQueue][Cron] Task exists for ${profile.name} (${existing[0]!.status}), skipping.`);
                    continue;
                }
            }
            */

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
        `) as TaskRow[];

        if (updated.length === 0) {
            // Update failed (race condition).
            // Check if queue busy now
            const currentRunningRes = await this.db.all(sql`SELECT count(*) as count FROM tasks WHERE status = 'running'`) as { count: number }[];
            if ((currentRunningRes[0]?.count || 0) > 0) return null;

            // Try again
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

    async processQueue(env: TaskEnv) {
        // console.log(`[TaskQueue] Starting global queue processing`);

        const stuckTimeout = 30 * 60 * 1000; // 30 minutes
        // We need to parse ISO dates in JS to compare, or trust SQL comparison if formats match.
        // Let's filter in JS to be safe with string dates.

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
                // Must map snake_case task props to camelCase if needed by logic?
                // Or just update internal logic to use snake_case task properties. 
                await this.executeTask(env, task);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error(`[TaskQueue] Task ${task.id} failed:`, message);
                await this.fail(task.id, message, { stage: 'execution' });
            }
        }
    }

    private async executeTask(env: TaskEnv, task: TaskRow) {
        const profileRes = await this.db.all(sql`SELECT * FROM generation_profiles WHERE id = ${task.profile_id} LIMIT 1`) as ProfileRow[];
        const profile = profileRes[0];

        if (!profile) throw new Error(`Profile not found: ${task.profile_id}`);

        // Source words from normalized table
        const wordRefs = await this.db.all(sql`
            SELECT word, type FROM daily_word_references WHERE date = ${task.task_date}
        `) as { word: string; type: 'new' | 'review' }[];

        if (wordRefs.length === 0) {
            // Fallback: Check if daily_words row exists but has no refs? (Shouldn't happen if migrated)
            // Or maybe we should allow empty?
            // Existing logic threw error if empty.
        }

        const newWords = uniqueStrings(wordRefs.filter(w => w.type === 'new').map(w => w.word));
        const reviewWords = uniqueStrings(wordRefs.filter(w => w.type === 'review').map(w => w.word));

        if (newWords.length + reviewWords.length === 0) throw new Error('Daily words record is empty');

        const usedWords = await getUsedWordsToday(this.db, task.task_date);
        const recentTitles = await getRecentTitles(this.db, task.task_date);
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
                const validStages = ['search_selection', 'draft', 'conversion', 'grammar_analysis'];
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
            topicPreference: profile.topic_preference || '',
            candidateWords: candidateWordStrings,
            recentTitles,
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

        // [Fix] Ensure idempotency with manual CASCADE delete
        // 1. Find existing article(s) that match this task/model combination
        const existingArticles = await this.db.all(sql`
            SELECT id FROM articles 
            WHERE generation_task_id = ${task.id} AND model = ${model} AND variant = 1
        `);

        if (existingArticles.length > 0) {
            const articleIds = (existingArticles as IdRow[]).map(a => `'${a.id}'`).join(',');

            // 2. Delete dependencies first (Foreign Key Constraints)
            await this.db.run(sql.raw(`DELETE FROM highlights WHERE article_id IN (${articleIds})`));
            await this.db.run(sql.raw(`DELETE FROM article_word_index WHERE article_id IN (${articleIds})`));

            // 3. Delete the articles
            await this.db.run(sql.raw(`DELETE FROM articles WHERE id IN (${articleIds})`));

            console.log(`[Task ${task.id}] Cleaned up ${existingArticles.length} existing article(s) before retry.`);
        }



        const sourceUrl = output.output.sources?.[0] || null;

        await this.db.run(sql`
            INSERT INTO articles (id, generation_task_id, model, variant, title, source_url, status, published_at)
            VALUES (${articleId}, ${task.id}, ${model}, 1, ${output.output.title}, ${sourceUrl}, 'published', ${finishedAt})
        `);

        // [Normalization] Dual Write: Insert into normalized tables
        if (output.output.articles) {
            for (const variant of output.output.articles) {
                const v = variant as typeof variant & { sentences?: any[] };
                await this.db.insert(articleVariants).values({
                    id: crypto.randomUUID(),
                    articleId: articleId,
                    level: v.level,
                    levelLabel: v.level_name || `Level ${v.level}`,
                    title: output.output.title,
                    content: v.content,
                    syntaxJson: JSON.stringify(v.structure || []),
                    sentencesJson: JSON.stringify(v.sentences || [])
                });
            }
        }

        if (output.output.word_definitions) {
            for (const wordDef of output.output.word_definitions) {
                const vocabId = crypto.randomUUID();
                // Parent keys are Unique(articleId, word), use onConflictDoNothing
                await this.db.insert(articleVocabulary).values({
                    id: vocabId,
                    articleId: articleId,
                    word: wordDef.word,
                    usedForm: wordDef.used_form, // [Refactor] Store used_form
                    phonetic: wordDef.phonetic
                }).onConflictDoNothing();

                // If collision happened, we need the existing ID.
                // But simplified: assuming generated words are unique per article in output.
                // If LLM returned duplicates, onConflictDoNothing skips.
                // We need the ID for child inserts.
                // Let's query it back to be safe.
                // Let's query it back to be safe.
                const vocabRow = await this.db.select()
                    .from(articleVocabulary)
                    .where(sql`${articleVocabulary.articleId} = ${articleId} AND ${articleVocabulary.word} = ${wordDef.word}`)
                    .limit(1);

                const targetVocabId = vocabRow[0]?.id || vocabId;

                if (wordDef.definitions) {
                    for (const def of wordDef.definitions) {
                        await this.db.insert(articleVocabDefinitions).values({
                            id: crypto.randomUUID(),
                            vocabId: targetVocabId,
                            partOfSpeech: def.pos,
                            definition: def.definition
                        });
                    }
                }
            }
        }

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
