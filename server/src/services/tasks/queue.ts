import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client';
import type { TaskRow, ProfileRow } from '../../types/models';
import { TaskExecutor } from './executor';

/**
 * Reliable Task Queue Service (可靠任务队列服务)
 * 
 * 架构模式：Database-as-a-Queue (基于数据库的任务队列)
 * 
 * 为什么不使用 Redis/RabbitMQ？
 * 1. 基础设施简化: 我们使用 SQLite/D1 作为唯一存储，适合 Serverless/Edge 部署，无需维护额外的消息中间件。
 * 2. 事务一致性: 任务状态 (Queued -> Running) 的变更与业务数据变更在同一个 ACID 事务边界内。
 * 
 * 核心机制：Optimistic Concurrency Control (乐观并发控制)
 * 使用 `version` 字段作为 CAS (Compare-And-Swap) 令牌，实现多 Worker 竞争下的原子抢占。
 */
export class TaskQueue {
    private executor: TaskExecutor;

    constructor(private db: AppDatabase) {
        this.executor = new TaskExecutor(db);
    }

    /**
     * 将新任务推入队列 (Enqueue)
     * 
     * 为系统中每个激活的生成配置 (Generation Profile) 创建一个待处理任务。
     * 如果系统尚未初始化 Profile，会自动创建一个默认配置以确保能够立即开始工作。
     * 
     * @param taskDate 目标生成日期 (YYYY-MM-DD)
     * @param triggerSource 触发源，用于统计区分 (manual: 用户点击, cron: 定时任务)
     * @param llm 可选的 LLM 模型重写，若指定则忽略环境变量配置
     * @returns 新创建的任务列表摘要
     */
    async enqueue(taskDate: string, triggerSource: 'manual' | 'cron' = 'manual', llm?: string) {
        const profiles = await this.db.all(sql`SELECT * FROM generation_profiles`) as ProfileRow[];

        if (profiles.length === 0) {
            // 如果不存在 Profile，则创建一个默认的
            const defId = crypto.randomUUID();
            const now = new Date().toISOString();
            await this.db.run(sql`
                INSERT INTO generation_profiles (id, name, topic_preference, concurrency, timeout_ms, created_at, updated_at) 
                VALUES (${defId}, 'Default', 'General News', 1, 3600000, ${now}, ${now}) 
                ON CONFLICT DO NOTHING
            `);
        }

        const activeProfiles = await this.db.all(sql`SELECT * FROM generation_profiles`) as ProfileRow[];

        // 检查当日是否已获取单词数据。这是硬性依赖，没有单词无法生成文章。
        const dailyRow = await this.db.all(sql`SELECT * FROM daily_word_references WHERE date = ${taskDate} LIMIT 1`);
        if (dailyRow.length === 0) {
            throw new Error(`No daily words found for ${taskDate}. Please fetch words first.`);
        }

        const newTasks: Array<{ id: string; profileId: string; profileName: string }> = [];

        for (const profile of activeProfiles) {
            const taskId = crypto.randomUUID();
            const now = new Date().toISOString();

            await this.db.run(sql`
                INSERT INTO tasks (id, task_date, type, trigger_source, status, profile_id, version, created_at, llm)
                VALUES (${taskId}, ${taskDate}, 'article_generation', ${triggerSource}, 'queued', ${profile.id}, 0, ${now}, ${llm || null})
            `);

            newTasks.push({ id: taskId, profileId: profile.id, profileName: profile.name });
        }

        return newTasks;
    }

    /**
     * 尝试领取一个任务 (Claim Task)
     * 
     * 实现核心的“竞争消费者模式”(Competing Consumers Pattern)。
     * 为了支持无状态的水平扩展 (Serverless/Edge)，这里不维护内存队列，
     * 而是直接通过数据库事务和原子更新来抢占任务。
     * 
     * 流程：
     * 1. 并发检查 (Concurrency Check)：首先验证当前运行数是否超限 (Limit: 1)
     * 2. 候选查找 (Candidate Selection)：获取最旧的 'queued' 状态任务
     * 3. 乐观锁更新 (Optimistic Lock Update)：尝试用 UPDATE ... WHERE version = x 原子地抢占该任务
     * 4. 结果验证 (Verification)：确认是否是当前实例成功更新了状态
     * 
     * @returns 成功抢占的任务对象，如果队列为空或竞争失败则返回 null
     */
    async claimTask(): Promise<TaskRow | null> {
        // [并发控制层]
        // 在尝试获取数据库锁之前，先进行一次轻量级的应用层检查。
        // 如果当前系统正在运行的任务数已达到上限 (目前硬编码为 1 以避免 LLM 速率限制)，
        // 则直接返回 null，实现“快速失败”，避免无谓的数据库写操作竞争。
        const runningCountRes = await this.db.all(sql`SELECT count(*) as count FROM tasks WHERE status = 'running'`) as { count: number }[];
        const runningCount = runningCountRes[0]?.count || 0;

        if (runningCount > 0) return null;

        // [任务选择]
        // 查找创建时间最早的待执行 (queued) 任务。
        // FIFO (先进先出) 策略保证了任务调度的公平性。
        const candidates = await this.db.all(sql`
            SELECT * FROM tasks 
            WHERE status = 'queued' 
            ORDER BY created_at ASC 
            LIMIT 1
        `) as TaskRow[];

        if (candidates.length === 0) return null;

        const candidate = candidates[0]!;
        const now = new Date().toISOString();

        // [Optimistic Locking Implementation]
        // 核心技术点：CAS (Compare And Swap) via SQL
        // UPDATE tasks SET ... WHERE id = x AND version = old_version
        // 
        // 只有当 version 未被其他 Worker 修改时，Update 才会成功（Affected Rows = 1）。
        // 如果 version 变了，说明任务已被抢走，Update 失败（Affected Rows = 0）。
        // 这种方式避免了重量级的数据库排他锁 (SELECT FOR UPDATE)，非常适合 SQLite (WAL mode) 高并发写。
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

        // [Post-Verification]
        // 由于 D1/SQLite 的 `run` 返回值在某些 driver 下可能不包含 affectedRows，
        // 我们通过一次 Read-Your-Writes 查询来确认抢占是否成功。
        // 这是一种 Defensive Programming 策略。
        const updated = await this.db.all(sql`
            SELECT * FROM tasks 
            WHERE id = ${candidate.id} AND status = 'running' AND started_at = ${now}
            LIMIT 1
        `) as TaskRow[];

        if (updated.length === 0) {
            // 抢占失败：说明在 SELECT 和 UPDATE 之间的微小时间窗口内，
            // 另一个 Worker 已经处理了这个任务。

            // 再次检查全局并发数，如果没满，递归尝试领取下一个任务。
            const currentRunningRes = await this.db.all(sql`SELECT count(*) as count FROM tasks WHERE status = 'running'`) as { count: number }[];
            if ((currentRunningRes[0]?.count || 0) > 0) return null;
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

    /**
     * 队列处理主循环 (Process Loop)
     * 
     * 包含两个主要阶段：
     * 1. 僵尸任务检测 (Stuck Task Reset)：扫描因为进程崩溃等原因长期处于 'running' 的任务并重置。
     * 2. 任务执行循环：只要有空闲和任务，就持续领取并执行。
     */
    async processQueue() {
        const stuckTimeout = 30 * 60 * 1000; // 30 minutes

        // [Self-Healing: Dead Letter Handling]
        // 僵尸任务 (Zombie Task) 检测
        // 如果一个任务标记为 'running' 但超过 30 分钟未更新 (stuckTimeout)，
        // 我们假设执行该任务的 Worker 已经崩溃 (OOM, Timeout, deploy restart)。
        // 策略: 这些任务应该被“释放”会队列 (Reset to queued) 进行重试，而不是永久占用 'running' 状态 (这会阻塞整个队列)。
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
                // 重置僵尸任务：将其状态改回 'queued' 并增加版本号，使其即刻可被再次领取
                await this.db.run(sql`
                    UPDATE tasks 
                    SET status = 'queued', started_at = NULL, version = version + 1 
                    WHERE id = ${stuck.id}
                `);
                console.log(`[TaskQueue] Reset stuck task ${stuck.id}`);
            }
        } else if (runningTasks.length > 0) {
            // 如果有正在运行的任务且未卡死，则本 Worker 暂不接管，维持限流。
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
                await this.executor.executeTask(task);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error(`[TaskQueue] Task ${task.id} failed:`, message);
                await this.fail(task.id, message, { stage: 'execution' });
            }
        }
    }
}
