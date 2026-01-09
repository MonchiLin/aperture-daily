import { TaskQueue } from '../src/services/tasks/queue';

const WORKER_INTERVAL_MS = 10000; // Check every 10 seconds
let isWorking = false;

/**
 * Background Task Worker
 * 
 * Periodically wakes up to process the ephemeral Task Queue.
 * Architecture: Polling-based worker.
 * - Interval: 10 seconds.
 * - Concurrency: Single-threaded event loop (effectively serial unless partitioned).
 * - Safety: Catches all errors to prevent process crash.
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
