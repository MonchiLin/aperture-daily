import { TaskQueue } from '../src/services/tasks/queue';

const WORKER_INTERVAL_MS = 10000; // Check every 10 seconds
let isWorking = false;

/**
 * Background Task Worker (后台任务工作进程)
 * 
 * 架构模式：Polling-Based Consumer (基于轮询的消费者)
 * 
 * 核心机制：
 * 1. 周期性唤醒：每 10 秒唤醒一次，检查队列中是否有 PENDING 任务。
 * 2. 伪并发 (Concurrency): Node.js 是单线程的。RunWorker 实际上是独占 Event Loop 的。
 *    这意味着同一时刻只能处理一个任务，但这正好符合我们的需求（避免 LLM Rate Limit）。
 * 3. 容错性：捕获所有未知异常，防止 Worker 进程崩溃导致整个服务不可用。
 */
async function runWorker(queue: TaskQueue) {
    if (isWorking) return;
    isWorking = true;
    try {
        await queue.processQueue();
    } catch (e) {
        console.error("Worker error:", e);
    } finally {
        isWorking = false;
        setTimeout(() => runWorker(queue), WORKER_INTERVAL_MS);
    }
}

export function startTaskWorker(queue: TaskQueue) {
    setTimeout(() => runWorker(queue), 1000); // Start after 1s delay
    console.log('[Task Worker] Started with 10s interval');
}
