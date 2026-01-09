/**
 * Task Executor - Uses Pipeline for article generation
 */

import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import type { TaskRow, ProfileRow, IdRow } from '../../types/models';
import { env } from '../env';
import { getUsedWordsToday, getRecentTitles, buildCandidateWords, uniqueStrings } from './helpers';

// LLM imports
import { createClient, type LLMClientConfig } from '../llm/client';
import { runPipeline, type PipelineCheckpoint } from '../llm/pipeline';

export class TaskExecutor {
    constructor(private db: AppDatabase) { }

    async executeTask(task: TaskRow) {
        const profileRes = await this.db.all(sql`SELECT * FROM generation_profiles WHERE id = ${task.profile_id} LIMIT 1`) as ProfileRow[];
        const profile = profileRes[0];

        if (!profile) throw new Error(`Profile not found: ${task.profile_id}`);

        // Source words from normalized table
        const wordRefs = await this.db.all(sql`
            SELECT word, type FROM daily_word_references WHERE date = ${task.task_date}
        `) as { word: string; type: 'new' | 'review' }[];

        const newWords = uniqueStrings(wordRefs.filter(w => w.type === 'new').map(w => w.word));
        const reviewWords = uniqueStrings(wordRefs.filter(w => w.type === 'review').map(w => w.word));

        if (newWords.length + reviewWords.length === 0) throw new Error('Daily words record is empty');

        const usedWords = await getUsedWordsToday(this.db, task.task_date);
        const recentTitles = await getRecentTitles(this.db, task.task_date);
        const candidates = buildCandidateWords(newWords, reviewWords, usedWords);

        if (candidates.length === 0) throw new Error('All words have been used today');

        // ==== Genkit Configuration ====
        const provider = (env.LLM_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'claude';

        let clientConfig: LLMClientConfig;
        if (provider === 'openai') {
            if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
            if (!env.OPENAI_MODEL) throw new Error('OPENAI_MODEL is required');
            clientConfig = {
                provider: 'openai',
                apiKey: env.OPENAI_API_KEY,
                baseUrl: env.OPENAI_BASE_URL,
                model: env.OPENAI_MODEL
            };
        } else if (provider === 'claude') {
            if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required');
            if (!env.ANTHROPIC_MODEL) throw new Error('ANTHROPIC_MODEL is required');
            clientConfig = {
                provider: 'claude',
                apiKey: env.ANTHROPIC_API_KEY,
                baseUrl: env.ANTHROPIC_BASE_URL,
                model: env.ANTHROPIC_MODEL
            };
        } else {
            if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
            if (!env.GEMINI_MODEL) throw new Error('GEMINI_MODEL is required');
            clientConfig = {
                provider: 'gemini',
                apiKey: env.GEMINI_API_KEY,
                baseUrl: env.GEMINI_BASE_URL,
                model: env.GEMINI_MODEL
            };
        }

        console.log(`[Task ${task.id}] Starting Genkit generation with Provider: ${provider}, Model: ${clientConfig.model}`);

        // Checkpoint Resumption Logic
        let checkpoint: PipelineCheckpoint | null = null;
        if (task.result_json) {
            try {
                const parsed = JSON.parse(task.result_json);
                const validStages = ['search_selection', 'draft', 'conversion', 'grammar_analysis'];
                if (parsed && typeof parsed === 'object' && 'stage' in parsed && validStages.includes(parsed.stage)) {
                    checkpoint = parsed as PipelineCheckpoint;
                    console.log(`[Task ${task.id}] Resuming from checkpoint: ${checkpoint.stage}`);
                }
            } catch (e) {
                console.warn(`[Task ${task.id}] Failed to parse checkpoint, starting fresh.`);
            }
        }

        const candidateWordStrings = candidates.map(c => c.word);

        // Create LLM Client & Run Pipeline
        const client = createClient(clientConfig);
        const output = await runPipeline({
            client,
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
        const finishedAt = new Date().toISOString();
        const resultData = {
            new_count: newWords.length,
            review_count: reviewWords.length,
            candidate_count: candidates.length,
            selected_words: output.selectedWords,
            generated: { model: clientConfig.model, provider, article_id: articleId },
            usage: output.usage ?? null
        };

        // [Fix] Ensure idempotency with manual CASCADE delete
        const existingArticles = await this.db.all(sql`
            SELECT id FROM articles 
            WHERE generation_task_id = ${task.id} AND model = ${clientConfig.model} AND variant = 1
        `);

        if (existingArticles.length > 0) {
            const articleIds = (existingArticles as IdRow[]).map(a => `'${a.id}'`).join(',');
            await this.db.run(sql.raw(`DELETE FROM highlights WHERE article_id IN (${articleIds})`));
            await this.db.run(sql.raw(`DELETE FROM article_word_index WHERE article_id IN (${articleIds})`));
            await this.db.run(sql.raw(`DELETE FROM articles WHERE id IN (${articleIds})`));
            console.log(`[Task ${task.id}] Cleaned up ${existingArticles.length} existing article(s) before retry.`);
        }

        // Use shared save function
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
