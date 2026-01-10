import { Kysely, ParseJSONResultsPlugin } from 'kysely';
import { BunSqliteDialect } from 'kysely-bun-sqlite';
import { Database as BunDatabase } from 'bun:sqlite';
import { D1Dialect } from 'kysely-d1';
import type { Database } from './types';
import * as path from 'path';

// Define the global type for Cloudflare Worker bindings
// In a real Worker project, this extends the Env interface
interface Env {
    DB: any; // D1Database type is not globally available in this context without @cloudflare/workers-types on global
}

export type AppKysely = Kysely<Database>;

export function createDatabase(env?: Env): AppKysely {
    const driver = process.env.DB_DRIVER || 'sqlite-local';

    // Plugins (Common)
    const plugins = [new ParseJSONResultsPlugin()];

    // [1] sqlite-local: Bun Native SQLite (Fastest for Dev)
    if (driver === 'sqlite-local') {
        const dbPath = process.env.DB_CONNECTION || path.resolve(import.meta.dir, '../../local.db');
        console.log(`[DB] Kysely Provider: sqlite-local (${dbPath})`);

        return new Kysely<Database>({
            dialect: new BunSqliteDialect({
                database: new BunDatabase(dbPath),
            }),
            plugins,
            log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
        });
    }

    // [2] d1-binding: Cloudflare Workers (Production)
    if (driver === 'd1-binding') {
        if (!env || !env.DB) {
            throw new Error("DB_DRIVER=d1-binding requires 'env.DB' to be passed to createDatabase(env)");
        }
        console.log(`[DB] Kysely Provider: d1-binding`);

        return new Kysely<Database>({
            dialect: new D1Dialect({ database: env.DB }),
            plugins,
        });
    }

    // [3] d1-http: Cloudflare HTTP API (Proxy for Dev)
    if (driver === 'd1-http') {
        // TODO: Implement custom Kysely Dialect using fetch() to Cloudflare API
        // For now, recommend using 'sqlite-local' and 'db:pull' script.
        throw new Error("D1 HTTP driver not implemented. Please use 'sqlite-local' and run 'bun run db:pull' to sync data.");
    }

    throw new Error(`Unknown DB_DRIVER: ${driver}`);
}

// Default export uses process.env, suitable for 'sqlite-local' usage.
// For Workers, we might need a different entry point or dependency injection.
// But mostly 'server/index.ts' is for Bun server (sqlite-local).
// The Worker entry point (if exists) should call createDatabase(env).
export const db = createDatabase();
