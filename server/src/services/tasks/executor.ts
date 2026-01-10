/**
 * Task Executor Engine (任务执行引擎) - Kysely Edition
 */

import type { AppKysely } from '../../db/factory';
import type { TaskRow } from '../../types/models';
import { env } from '../env';
import { getUsedWordsToday, getRecentTitles, buildCandidateWords, uniqueStrings } from './helpers';

// LLM 模块引用
import { createClient, type LLMClientConfig } from '../llm/client';
import { runPipeline, type PipelineCheckpoint } from '../llm/pipeline';

export class TaskExecutor {
    constructor(private db: AppKysely) { }

    async executeTask(task: TaskRow) {
        // [1] Profile Fetch
        const profile = await this.db.selectFrom('generation_profiles')
            .selectAll()
            .where('id', '=', task.profile_id)
            .executeTakeFirst();

        if (!profile) throw new Error(`Profile not found: ${task.profile_id}`);

        // [2] Context Preparation
        const wordRefs = await this.db.selectFrom('daily_word_references')
            .select(['word', 'type'])
            .where('date', '=', task.task_date)
            .execute();

        const newWords = uniqueStrings(wordRefs.filter(w => w.type === 'new').map(w => w.word));
        const reviewWords = uniqueStrings(wordRefs.filter(w => w.type === 'review').map(w => w.word));

        if (newWords.length + reviewWords.length === 0) throw new Error('Daily words record is empty');

        const usedWords = await getUsedWordsToday(this.db, task.task_date);
        const recentTitles = await getRecentTitles(this.db, task.task_date);
        const candidates = buildCandidateWords(newWords, reviewWords, usedWords);

        if (candidates.length === 0) throw new Error('All words have been used today');

        // [3] LLM Config
        const provider = (task.llm || env.LLM_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'claude';
        let clientConfig: LLMClientConfig;

        // ... (Configuration logic unchanged, except maybe cleaner error handling)
        if (provider === 'openai') {
            if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
            clientConfig = { provider: 'openai', apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL, model: env.OPENAI_MODEL || 'gpt-4' };
        } else if (provider === 'claude') {
            if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required');
            clientConfig = { provider: 'claude', apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL, model: env.ANTHROPIC_MODEL || 'claude-3-opus' };
        } else {
            if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
            clientConfig = { provider: 'gemini', apiKey: env.GEMINI_API_KEY, baseUrl: env.GEMINI_BASE_URL, model: env.GEMINI_MODEL || 'gemini-pro' };
        }

        console.log(`[Task ${task.id}] Starting Genkit generation with Provider: ${provider}, Model: ${clientConfig.model}`);

        // [4] Checkpoint Resumption
        // Kysely automatically parses JSON columns!
        let checkpoint: PipelineCheckpoint | null = null;
        if (task.result_json) {
            // task.result_json is ALREADY an object
            const parsed = task.result_json as any;
            const validStages = ['search_selection', 'draft', 'conversion', 'grammar_analysis'];
            if (parsed && typeof parsed === 'object' && 'stage' in parsed && validStages.includes(parsed.stage)) {
                checkpoint = parsed as PipelineCheckpoint;
                console.log(`[Task ${task.id}] Resuming from checkpoint: ${checkpoint.stage}`);
            }
        }

        const candidateWordStrings = candidates.map(c => c.word);

        // [5] Pipeline Execution
        const client = createClient(clientConfig);
        const output = await runPipeline({
            client,
            currentDate: task.task_date,
            topicPreference: profile.topic_preference || '',
            candidateWords: candidateWordStrings,
            recentTitles,
            checkpoint,
            onCheckpoint: async (cp) => {
                await this.db.updateTable('tasks')
                    .set({ result_json: JSON.stringify(cp) })
                    .where('id', '=', task.id)
                    .execute();
                console.log(`[Task ${task.id}] Saved checkpoint: ${cp.stage}`);
            }
        });

        const articleId = crypto.randomUUID();

        // [6] Data Cleanup & Consistency
        // Find existing articles to clean up (Cleanup Strategy)
        const existingArticles = await this.db.selectFrom('articles')
            .select(['id'])
            .where('generation_task_id', '=', task.id)
            .where('model', '=', clientConfig.model)
            .where('variant', '=', 1)
            .execute();

        if (existingArticles.length > 0) {
            const articleIds = existingArticles.map(a => a.id);

            // Delete child tables first (Manual Cascading)
            await this.db.deleteFrom('highlights').where('article_id', 'in', articleIds).execute();
            await this.db.deleteFrom('article_word_index').where('article_id', 'in', articleIds).execute();
            await this.db.deleteFrom('article_variants').where('article_id', 'in', articleIds).execute(); // Added variant cleanup
            await this.db.deleteFrom('articles').where('id', 'in', articleIds).execute();

            console.log(`[Task ${task.id}] Cleaned up ${existingArticles.length} existing article(s) before retry.`);
        }

        // [7] Persistence
        const { saveArticleResult } = await import('./saveArticle');
        await saveArticleResult({
            db: this.db,
            result: output,
            taskId: task.id,
            taskDate: task.task_date,
            model: clientConfig.model,
            profileId: profile.id,
            topicPreference: profile.topic_preference || undefined,
            newWords,
            reviewWords
        });

        const finishedAt = new Date().toISOString();
        const resultData = {
            new_count: newWords.length,
            review_count: reviewWords.length,
            candidate_count: candidates.length,
            selected_words: output.selectedWords,
            generated: { model: clientConfig.model, provider, article_id: articleId },
            usage: output.usage ?? null
        };

        await this.db.updateTable('tasks')
            .set({
                status: 'succeeded',
                result_json: JSON.stringify(resultData),
                finished_at: finishedAt,
                published_at: finishedAt
            })
            .where('id', '=', task.id)
            .execute();

        console.log(`[Task ${task.id}] Completed successfully`);
    }
}
