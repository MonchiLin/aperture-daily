/**
 * Task Executor Engine (任务执行引擎)
 * 
 * 核心职责：Pipeline Orchestration (流水线编排)
 * 接收一个 "Pending Task"，驱动整个文章生成流水线 (Search -> Draft -> JSON -> Grammar)，
 * 并负责状态管理、断点续传和最终的数据持久化。
 * 
 * 设计原则：
 * 1. Idempotency (幂等性): 任务可以重复执行，失败重试不会产生脏数据。
 * 2. Resumability (可恢复性): 利用 Checkpoint 机制，Worker 崩溃重启后，能跳过已完成的耗时步骤。
 * 3. Atomic Consistency (原子一致性): 最终写入时，确保关联数据的完整性 (Article + Words + Highlights)。
 */

import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import type { TaskRow, ProfileRow, IdRow } from '../../types/models';
import { env } from '../env';
import { getUsedWordsToday, getRecentTitles, buildCandidateWords, uniqueStrings } from './helpers';

// LLM 模块引用 - 负责模型交互和流水线执行
import { createClient, type LLMClientConfig } from '../llm/client';
import { runPipeline, type PipelineCheckpoint } from '../llm/pipeline';

export class TaskExecutor {
    constructor(private db: AppDatabase) { }

    async executeTask(task: TaskRow) {
        const profileRes = await this.db.all(sql`SELECT * FROM generation_profiles WHERE id = ${task.profile_id} LIMIT 1`) as ProfileRow[];
        const profile = profileRes[0];

        if (!profile) throw new Error(`Profile not found: ${task.profile_id}`);

        // [上下文准备]
        // 1. 获取当日所有新词和复习词，验证数据完整性
        // 2. 获取当日已生成的文章使用的单词，避免重复使用
        // 3. 获取近期文章标题，用于 LLM 避免选题重复
        // 4. 构建当前可用的候选词列表，如果为空则直接终止任务

        // 从规范化表获取单词
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

        // [LLM 客户端配置]
        // 确定使用的 AI 提供商 (Gemini, OpenAI, Claude) 并加载相应的 API 密钥和模型配置。
        // 优先级：任务级配置 > 环境变量默认值 > 默认值 (gemini)
        // ==== Genkit Configuration ====
        const provider = (task.llm || env.LLM_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'claude';

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

        // [断点续传机制] (Checkpoint Resumption)
        // 检查任务是否包含中间结果 (result_json)。如果存在且包含有效的 stage 字段，
        // 则认为可以从该阶段恢复，而不是从头开始 (从头开始既浪费 Token 又耗时)。
        // 这对于 Long-Running 任务 (如 LLM 生成) 至关重要。
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

        // [核心执行]
        // 启动 LLM 流水线，并注入 onCheckpoint 回调。
        // 每当 Pipeline 完成一个子阶段 (Stage)，都会调用该回调将中间状态保存到数据库。
        // 这样即使 Worker 崩溃，下次也能从最近的 Checkpoint 继续。
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

        // [Data Cleaning & Consistency Strategy]
        // 策略: Clean-Before-Write (写前清理)
        // 为什么需要手动删除？
        // 1. 幂等性保障: 如果任务重试 (Retry)，旧的“半成品”文章可能还在数据库里。
        // 2. 数据库限制: 虽然 Drizzle 支持外键，但 SQLite/D1 的外键约束检查有时会被禁用 (在 sync 脚本中)，
        //    或者为了应用层的灵活性，我选择了显式的级联删除 (Explicit Cascading Delete)。
        //    顺序: Highlights (子表) -> Index (子表) -> Articles (主表)。
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

        // [结果持久化]
        // 调用共享的保存逻辑，将结构化的文章数据 (标题、内容、变体、单词索引) 写入数据库。
        // 这包括创建 Article 记录、Variations、以及构建词汇倒排索引。
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
