import type { AppKysely } from '../../db/factory';
import type { TaskRow } from '../../types/models';
import { TaskExecutor } from './executor';

/**
 * 任务队列服务 (TaskQueue)
 *
 * 核心职责：管理文章生成任务的完整生命周期
 *
 * 状态机设计：
 *   queued → running → succeeded
 *                   ↘ failed
 *
 * 2. 乐观锁：通过 version 字段防止多 Worker 重复认领同一任务
 * 3. 可见性超时 (Visibility Timeout)：
 *    Worker 认领任务时获得 5 分钟租约 (locked_until)。
 *    若 Worker 崩溃导致锁过期，其他 Worker 可自动接手重试。
 *    正常运行的 Worker 需定期调用 keepAlive() 续租。
 */
export class TaskQueue {
    private executor: TaskExecutor;

    constructor(private db: AppKysely) {
        this.executor = new TaskExecutor(db);
    }

    /**
     * 入队：为指定日期创建生成任务
     *
     * 每个 generation_profile 会创建一个独立任务，支持多主题并行生成。
     * 若无 Profile 存在，会自动创建一个默认 Profile（首次使用场景）。
     */
    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual', llm?: string, mode: 'rss' | 'impression' = 'rss') {
        const profiles = await this.db.selectFrom('generation_profiles').selectAll().execute();

        // 首次使用时自动创建默认 Profile，降低上手门槛
        if (profiles.length === 0) {
            const defId = crypto.randomUUID();
            await this.db.insertInto('generation_profiles')
                .values({
                    id: defId,
                    name: 'Default',
                })
                .onConflict((oc) => oc.doNothing())
                .execute();
        }

        const activeProfiles = await this.db.selectFrom('generation_profiles').selectAll().execute();

        // 前置校验：必须先抓取当日单词才能生成文章
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

            await this.db.insertInto('tasks')
                .values({
                    id: taskId,
                    task_date: taskDate,
                    type: 'article_generation',
                    trigger_source: triggerSource,
                    status: 'queued',
                    profile_id: profile.id,
                    version: 0,  // 乐观锁初始版本
                    llm: (llm as any) || null,
                    mode,
                    // result_json: removed
                })
                .execute();

            newTasks.push({ id: taskId, profileId: profile.id, profileName: profile.name });
        }

        return newTasks;
    }

    /**
     * IMPRESSION 入队：从词库随机选词创建生成任务
     *
     * 与 enqueue 的区别：
     * 1. 不依赖 daily_word_references，直接从 words 表随机选取
     * 2. 候选词存入 result_json，执行时直接使用
     * 3. 只创建单个任务（不按 Profile 分裂）
     */
    async enqueueImpression(taskDate: string, wordCount: number = 1024, llm?: string) {
        // 从 words 表随机选取词汇
        const randomWords = await this.db
            .selectFrom('words')
            .select('word')
            .orderBy(({ fn }) => fn('random', []))
            .limit(wordCount)
            .execute();

        if (randomWords.length === 0) {
            throw new Error('No words in database. Please add words first.');
        }

        // 获取默认 Profile
        let profile = await this.db.selectFrom('generation_profiles')
            .selectAll()
            .limit(1)
            .executeTakeFirst();

        // 若无 Profile，创建默认
        if (!profile) {
            const defId = crypto.randomUUID();
            await this.db.insertInto('generation_profiles')
                .values({ id: defId, name: 'Default' })
                .execute();
            // 重新查询以获取完整字段
            profile = await this.db.selectFrom('generation_profiles')
                .selectAll()
                .where('id', '=', defId)
                .executeTakeFirstOrThrow();
        }

        const taskId = crypto.randomUUID();
        const candidateWords = randomWords.map(w => w.word);

        await this.db.insertInto('tasks')
            .values({
                id: taskId,
                task_date: taskDate,
                type: 'article_generation',
                trigger_source: 'manual',
                status: 'queued',
                profile_id: profile.id,
                version: 0,
                llm: (llm as any) || null,
                mode: 'impression',
                // result_json: removed (candidates are now generated at runtime)
            })
            .execute();

        console.log(`[TaskQueue] Created IMPRESSION task ${taskId} with ${candidateWords.length} words`);

        return [{ id: taskId, profileId: profile.id, wordCount: candidateWords.length }];
    }

    /**
     * 认领任务（乐观锁实现）
     *
     * 为什么用乐观锁而非悲观锁？
     * - SQLite 不支持 SELECT FOR UPDATE
     * - 任务认领是低频操作，冲突概率极低，乐观锁足够
     *
     * 认领流程：
     * 1. 检查是否已有任务在运行（单并发约束）
     * 2. 选择最早的 queued 任务
     * 3. 用 version 条件更新状态，若失败说明被其他 Worker 抢走
     * 4. 更新失败时递归重试（冲突后可能有新任务可认领）
     */
    async claimTask(): Promise<TaskRow | null> {
        const now = new Date();
        const nowStr = now.toISOString();

        // 1. 全局并发控制：检查是否有 *有效持有锁* 的运行中任务
        // 如果有任务正在运行且锁未过期，则不允许开始新任务
        const runningValid = await this.db.selectFrom('tasks')
            .selectAll()
            .where('status', '=', 'running')
            .where('locked_until', '>', nowStr)
            .executeTakeFirst();

        if (runningValid) {
            // [Debug] Found running task ${runningValid.id} locked until ${runningValid.locked_until}
            return null;
        }

        // 2. 查找可用任务：(Status=queued) OR (Status=running AND LockExpired)
        // 允许重试因 Crash 而锁过期的任务
        const candidate = await this.db.selectFrom('tasks')
            .selectAll()
            .where((eb) => eb.or([
                eb('status', '=', 'queued'),
                eb.and([
                    eb('status', '=', 'running'),
                    eb('locked_until', '<', nowStr)
                ])
            ]))
            .orderBy('created_at', 'asc')
            .limit(1)
            .executeTakeFirst();

        if (!candidate) return null;

        // 获得 5 分钟租约
        const limitDate = new Date(now.getTime() + 5 * 60 * 1000); // +5 min
        const lockedUntil = limitDate.toISOString();

        // 乐观锁更新
        const result = await this.db.updateTable('tasks')
            .set({
                status: 'running',
                started_at: nowStr,
                version: (eb) => eb('version', '+', 1),
                locked_until: lockedUntil,
                error_message: null,
                error_context_json: null
            })
            .where('id', '=', candidate.id)
            .where('version', '=', candidate.version) // 确保未被抢占
            .executeTakeFirst();

        if (Number(result.numUpdatedRows) === 0) {
            // 争抢失败，递归重试（可能还有其他任务）
            return this.claimTask();
        }

        // 返回更新后的任务数据
        const updated = await this.db.selectFrom('tasks')
            .selectAll()
            .where('id', '=', candidate.id)
            .executeTakeFirst();

        return updated || null;
    }

    /** 标记任务成功完成 */
    async complete(taskId: string) {
        const now = new Date().toISOString();
        await this.db.updateTable('tasks')
            .set({
                status: 'succeeded',
                // result_json: removed
                finished_at: now,
                published_at: now,
                error_message: null,
                error_context_json: null
            })
            .where('id', '=', taskId)
            .execute();
    }

    /** 标记任务失败，记录错误信息供调试 */
    async fail(taskId: string, errorMessage: string, errorContext: Record<string, unknown>) {
        const now = new Date().toISOString();
        const retryCount = (errorContext.retryCount as number) || 0;

        await this.db.updateTable('tasks')
            .set({
                status: 'failed',
                error_message: errorMessage,
                error_context_json: JSON.stringify(errorContext),
                finished_at: now,
                locked_until: null // 释放锁
            })
            .where('id', '=', taskId)
            .execute();
    }

    /**
     * 续租锁 (Keep Alive)
     * 给当前任务续命 5 分钟，防止被其他 Worker 抢占
     */
    async keepAlive(taskId: string) {
        const now = Date.now();
        const nextLock = new Date(now + 5 * 60 * 1000).toISOString();

        await this.db.updateTable('tasks')
            .set({ locked_until: nextLock })
            .where('id', '=', taskId)
            .where('status', '=', 'running') // 只有运行中的任务才需要续租
            .execute();

        // Silent update, no logs to avoid noise
    }

    async processQueue() {
        // [Refactor] 移除了传统的僵尸检测逻辑
        // 可见性超时机制 (claimTask 中的 locked_until 判断) 会自动处理卡死的任务

        // 循环处理所有可用任务
        while (true) {
            const task = await this.claimTask();
            if (!task) break;

            console.log(`[TaskQueue] Processing task ${task.id} for date ${task.task_date}`);

            try {
                await this.executor.executeTask(task, this); // Pass queue instance for keepAlive
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error(`[TaskQueue] Task ${task.id} failed:`, message);
                await this.fail(task.id, message, { stage: 'execution' });
            }
        }
    }
}
