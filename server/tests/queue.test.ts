import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Kysely, Migrator, FileMigrationProvider } from 'kysely';
import { BunSqliteDialect } from 'kysely-bun-sqlite';
import { Database as BunDatabase } from 'bun:sqlite';
import * as path from 'path';
import { promises as fs } from 'fs';
import { TaskQueue } from '../src/services/tasks/queue';
import type { Database } from '../src/db/types';

describe("TaskQueue Integration", () => {
    let db: Kysely<Database>;
    let queue: TaskQueue;

    beforeAll(async () => {
        // [1] Setup In-Memory DB
        db = new Kysely<Database>({
            dialect: new BunSqliteDialect({
                database: new BunDatabase(":memory:"),
            }),
        });

        // [2] Run Migrations
        const migrator = new Migrator({
            db,
            provider: new FileMigrationProvider({
                fs,
                path,
                migrationFolder: path.join(import.meta.dir, '../src/db/migrations'),
            }),
        });

        const { error } = await migrator.migrateToLatest();
        if (error) {
            console.error(error);
            throw error;
        }

        // [3] Init Queue
        queue = new TaskQueue(db);

        // [4] Insert necessary seed data (Generation Profile)
        await db.insertInto('generation_profiles')
            .values({
                id: 'default-profile',
                name: 'Default Test Profile'
            })
            .execute();

        // [5] Insert mock daily words (required for enqueue)
        await db.insertInto('daily_word_references')
            .values({
                id: 'ref-1',
                date: '2024-01-01',
                word: 'test',
                type: 'new'
            })
            .execute();
    });

    afterAll(async () => {
        await db.destroy();
    });

    test("enqueue - creates a queued task", async () => {
        const tasks = await queue.enqueue('2024-01-01', 'manual');
        expect(tasks.length).toBe(1);

        const row = await db.selectFrom('tasks').selectAll().where('id', '=', tasks[0].id).executeTakeFirstOrThrow();
        expect(row.status).toBe('queued');
        expect(row.version).toBe(0);
        expect(row.locked_until).toBeNull();
    });

    test("claimTask - happy path", async () => {
        const tasks = await queue.enqueue('2024-01-01', 'manual');
        const taskId = tasks[0].id;

        const claimed = await queue.claimTask();
        expect(claimed).not.toBeNull();
        if (!claimed) return;

        // FIFO: Assuming previous test task is also there, claimTask logic picks 'created_at asc'.
        // Since previous test ran first, it might pick that one. 
        // Let's clear execution first? Or just check *a* task was returned.

        expect(claimed.status).toBe('running');
        expect(claimed.locked_until).not.toBeNull();

        // Verify lock is roughly 5 mins in future
        const lockTime = new Date(claimed.locked_until!).getTime();
        const now = Date.now();
        const diff = lockTime - now;
        expect(diff).toBeGreaterThan(290 * 1000); // > 4m 50s
        expect(diff).toBeLessThan(310 * 1000);    // < 5m 10s
    });

    test("claimTask - concurrency limit", async () => {
        // Ensure one task is running (from previous test)
        // Try claim again
        const claimed = await queue.claimTask();
        // Should be null because we allow strictly 1 running task
        expect(claimed).toBeNull();
    });

    test("keepAlive - extends lock", async () => {
        // Find the running task
        const running = await db.selectFrom('tasks')
            .selectAll()
            .where('status', '=', 'running')
            .executeTakeFirst();

        if (!running) throw new Error("No running task found for test");

        const oldLock = new Date(running.locked_until!).getTime();

        // Wait a small bit so time moves forward? No need, keepAlive adds 5 mins from NOW.
        await queue.keepAlive(running.id);

        const updated = await db.selectFrom('tasks')
            .selectAll()
            .where('id', '=', running.id)
            .executeTakeFirstOrThrow();

        const newLock = new Date(updated.locked_until!).getTime();
        expect(newLock).toBeGreaterThan(oldLock);
    });

    test("Visibility Timeout - crash recovery", async () => {
        // [Cleanup] Ensure no other queued tasks interfere (from previous tests)
        await db.deleteFrom('tasks').where('status', '=', 'queued').execute();

        // 1. Manually expire the lock of the running task
        const running = await db.selectFrom('tasks')
            .selectAll()
            .where('status', '=', 'running')
            .executeTakeFirst();

        if (!running) throw new Error("No running task found");

        const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

        await db.updateTable('tasks')
            .set({ locked_until: oneHourAgo })
            .where('id', '=', running.id)
            .execute();

        // 2. Now `claimTask` should pick it up again
        const recovered = await queue.claimTask();

        expect(recovered).not.toBeNull();
        expect(recovered!.id).toBe(running.id);
        expect(recovered!.status).toBe('running');
        expect(recovered!.version).toBeGreaterThan(running.version); // Version incremented

        // Lock should be fresh
        const newLock = new Date(recovered!.locked_until!).getTime();
        expect(newLock).toBeGreaterThan(Date.now());
    });
});
