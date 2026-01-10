/**
 * 任务执行器 (TaskExecutor)
 *
 * 核心职责：执行单个文章生成任务的完整流程
 *
 * 执行流程：
 *   1. 加载生成配置 (Profile)
 *   2. 准备候选词（新词优先，过滤已用词）
 *   3. 构建 LLM 客户端配置
 *   4. 恢复 Checkpoint（支持断点续传）
 *   5. 执行生成流水线
 *   6. 清理旧数据（重试场景）
 *   7. 持久化结果
 *
 * 关键设计决策：
 * - Checkpoint 机制：每个阶段完成后保存中间状态，崩溃后可从断点恢复，避免重复调用 LLM
 * - 幂等清理：重试时先删除该任务之前生成的文章，确保数据一致性
 */

import type { AppKysely } from '../../db/factory';
import type { TaskRow } from '../../types/models';
import { env } from '../env';
import { getUsedWordsToday, getRecentTitles, buildCandidateWords, uniqueStrings } from './helpers';

import { createClient, type LLMClientConfig } from '../llm/client';
import { runPipeline, type PipelineCheckpoint } from '../llm/pipeline';

export class TaskExecutor {
    constructor(private db: AppKysely) { }

    async executeTask(task: TaskRow) {
        // ─────────────────────────────────────────────────────────────
        // [1] 加载生成配置
        // ─────────────────────────────────────────────────────────────
        const profile = await this.db.selectFrom('generation_profiles')
            .selectAll()
            .where('id', '=', task.profile_id)
            .executeTakeFirst();

        if (!profile) throw new Error(`Profile not found: ${task.profile_id}`);

        // ─────────────────────────────────────────────────────────────
        // [2] 准备候选词
        //
        // 策略：新词优先，已被当日其他文章使用的词会被过滤
        // 这样多个 Profile 可以生成不同词汇组合的文章
        // ─────────────────────────────────────────────────────────────
        const wordRefs = await this.db.selectFrom('daily_word_references')
            .select(['word', 'type'])
            .where('date', '=', task.task_date)
            .execute();

        const newWords = uniqueStrings(wordRefs.filter(w => w.type === 'new').map(w => w.word));
        const reviewWords = uniqueStrings(wordRefs.filter(w => w.type === 'review').map(w => w.word));

        if (newWords.length + reviewWords.length === 0) {
            throw new Error('Daily words record is empty');
        }

        const usedWords = await getUsedWordsToday(this.db, task.task_date);
        const recentTitles = await getRecentTitles(this.db, task.task_date);
        const candidates = buildCandidateWords(newWords, reviewWords, usedWords);

        if (candidates.length === 0) {
            throw new Error('All words have been used today');
        }

        // ─────────────────────────────────────────────────────────────
        // [3] 构建 LLM 客户端配置
        //
        // 优先级：任务指定 > 环境变量 > 默认 Gemini
        // ─────────────────────────────────────────────────────────────
        const provider = (task.llm || env.LLM_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'claude';
        let clientConfig: LLMClientConfig;

        if (provider === 'openai') {
            if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
            clientConfig = {
                provider: 'openai',
                apiKey: env.OPENAI_API_KEY,
                baseUrl: env.OPENAI_BASE_URL,
                model: env.OPENAI_MODEL || 'gpt-4'
            };
        } else if (provider === 'claude') {
            if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required');
            clientConfig = {
                provider: 'claude',
                apiKey: env.ANTHROPIC_API_KEY,
                baseUrl: env.ANTHROPIC_BASE_URL,
                model: env.ANTHROPIC_MODEL || 'claude-3-opus'
            };
        } else {
            if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
            clientConfig = {
                provider: 'gemini',
                apiKey: env.GEMINI_API_KEY,
                baseUrl: env.GEMINI_BASE_URL,
                model: env.GEMINI_MODEL || 'gemini-pro'
            };
        }

        console.log(`[Task ${task.id}] Starting generation with Provider: ${provider}, Model: ${clientConfig.model}`);

        // ─────────────────────────────────────────────────────────────
        // [4] Checkpoint 恢复（断点续传）
        //
        // 为什么需要 Checkpoint？
        // - LLM 调用耗时长（分钟级），进程崩溃或网络中断时不想从头重来
        // - 每个阶段完成后保存中间状态到 result_json
        // - 重新执行时检测有效 Checkpoint 并跳过已完成阶段
        // ─────────────────────────────────────────────────────────────
        let checkpoint: PipelineCheckpoint | null = null;
        if (task.result_json) {
            const parsed = task.result_json as any;
            const validStages = ['search_selection', 'draft', 'conversion', 'grammar_analysis'];
            if (parsed && typeof parsed === 'object' && 'stage' in parsed && validStages.includes(parsed.stage)) {
                checkpoint = parsed as PipelineCheckpoint;
                console.log(`[Task ${task.id}] Resuming from checkpoint: ${checkpoint.stage}`);
            }
        }

        const candidateWordStrings = candidates.map(c => c.word);

        // ─────────────────────────────────────────────────────────────
        // [5] 执行生成流水线
        // ─────────────────────────────────────────────────────────────
        const client = createClient(clientConfig);
        const output = await runPipeline({
            client,
            currentDate: task.task_date,
            topicPreference: profile.topic_preference || '',
            candidateWords: candidateWordStrings,
            recentTitles,
            checkpoint,
            onCheckpoint: async (cp) => {
                // 每个阶段完成后持久化 Checkpoint
                await this.db.updateTable('tasks')
                    .set({ result_json: JSON.stringify(cp) })
                    .where('id', '=', task.id)
                    .execute();
                console.log(`[Task ${task.id}] Saved checkpoint: ${cp.stage}`);
            }
        });

        const articleId = crypto.randomUUID();

        // ─────────────────────────────────────────────────────────────
        // [6] 幂等清理：删除该任务之前生成的文章
        //
        // 为什么需要清理？
        // - 任务重试时，旧数据会导致重复
        // - 手动级联删除，因为 SQLite 外键约束配置可能不一致
        // ─────────────────────────────────────────────────────────────
        const existingArticles = await this.db.selectFrom('articles')
            .select(['id'])
            .where('generation_task_id', '=', task.id)
            .where('model', '=', clientConfig.model)
            .where('variant', '=', 1)
            .execute();

        if (existingArticles.length > 0) {
            const articleIds = existingArticles.map(a => a.id);

            // 手动级联删除：先删子表再删主表
            await this.db.deleteFrom('highlights').where('article_id', 'in', articleIds).execute();
            await this.db.deleteFrom('article_word_index').where('article_id', 'in', articleIds).execute();
            await this.db.deleteFrom('article_variants').where('article_id', 'in', articleIds).execute();
            await this.db.deleteFrom('articles').where('id', 'in', articleIds).execute();

            console.log(`[Task ${task.id}] Cleaned up ${existingArticles.length} existing article(s) before retry.`);
        }

        // ─────────────────────────────────────────────────────────────
        // [7] 持久化结果
        // ─────────────────────────────────────────────────────────────
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

