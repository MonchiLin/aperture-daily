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
 * 关键设计决策：
 * 1. 单并发执行：同一时刻只允许一个任务运行，避免 LLM API 并发限制和资源竞争
 * 2. 乐观锁：通过 version 字段防止多 Worker 重复认领同一任务
 * 3. 僵尸检测：自动恢复卡住超过 30 分钟的任务，防止队列阻塞
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
        // 单并发检查：若已有任务运行，直接返回
        const runningCount = await this.db.selectFrom('tasks')
            .select((eb) => eb.fn.countAll<number>().as('count'))
            .where('status', '=', 'running')
            .executeTakeFirst();

        if (Number(runningCount?.count || 0) > 0) return null;

        // FIFO 选择：按创建时间升序取最早的任务
        const candidate = await this.db.selectFrom('tasks')
            .selectAll()
            .where('status', '=', 'queued')
            .orderBy('created_at', 'asc')
            .limit(1)
            .executeTakeFirst();

        if (!candidate) return null;

        const now = new Date().toISOString();

        // 乐观锁更新：version 条件确保任务未被其他 Worker 修改
        const result = await this.db.updateTable('tasks')
            .set({
                status: 'running',
                started_at: now,
                version: (eb) => eb('version', '+', 1),
                error_message: null,        // 重试时清除上次错误
                error_context_json: null
            })
            .where('id', '=', candidate.id)
            .where('status', '=', 'queued')
            .where('version', '=', candidate.version)
            .executeTakeFirst();

        // 更新失败：任务已被其他 Worker 认领
        if (Number(result.numUpdatedRows) === 0) {
            // 再次检查是否有任务在运行，避免无限递归
            const currentRunning = await this.db.selectFrom('tasks')
                .select((eb) => eb.fn.countAll<number>().as('count'))
                .where('status', '=', 'running')
                .executeTakeFirst();

            if (Number(currentRunning?.count || 0) > 0) return null;
            return this.claimTask();  // 递归重试
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
        await this.db.updateTable('tasks')
            .set({
                status: 'failed',
                error_message: errorMessage,
                error_context_json: JSON.stringify(errorContext),
                finished_at: now
            })
            .where('id', '=', taskId)
            .execute();
    }

    /**
     * 处理队列（由 Worker 定期调用）
     *
     * 僵尸任务检测：
     * - 任务 running 超过 30 分钟视为卡住（可能是进程崩溃或网络中断）
     * - 自动重置为 queued 状态，version+1 防止原 Worker 继续操作
     *
     * 为什么用 while(true) 循环？
     * - 一次调用处理所有可用任务，减少 Worker 轮询开销
     * - claimTask 返回 null 时自动退出
     */
    async processQueue() {
        // 僵尸检测阈值：30 分钟（LLM 生成通常 5-10 分钟完成）
        const stuckTimeout = 30 * 60 * 1000;

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
                // version+1 使原 Worker 的后续操作失效
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
            // 有正常运行的任务，不处理新任务
            return;
        }

        // 循环处理所有可用任务
        while (true) {
            const task = await this.claimTask();
            if (!task) break;

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
