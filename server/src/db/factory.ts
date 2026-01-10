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

    // [3] d1-http: Cloudflare HTTP API
    // Uses standard Cloudflare API credentials
    if (driver === 'd1-http') {
        const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        const databaseId = process.env.CLOUDFLARE_DATABASE_ID;
        const apiKey = process.env.CLOUDFLARE_API_TOKEN;

        if (!accountId || !databaseId || !apiKey) {
            throw new Error("DB_DRIVER=d1-http requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, and CLOUDFLARE_API_TOKEN");
        }

        console.log(`[DB] Kysely Provider: d1-http (Account: ${accountId}, DB: ${databaseId})`);

        // Note: Community dialect 'kysely-d1-http' would be used here.
        throw new Error("D1 HTTP dialect not installed. Configuration is valid, but driver is missing.");
    }

    // [4] turso: LibSQL via HTTP/WebSocket
    if (driver === 'turso') {
        const url = process.env.DB_CONNECTION;
        const authToken = process.env.TURSO_AUTH_TOKEN;

        if (!url) throw new Error("DB_DRIVER=turso requires DB_CONNECTION to be set (e.g., libsql://...)");

        console.log(`[DB] Kysely Provider: turso (${url})`);

        // Dynamic import to avoid bundling issues if not used
        const { LibsqlDialect } = require('@libsql/kysely-libsql');

        return new Kysely<Database>({
            dialect: new LibsqlDialect({
                url,
                authToken: authToken || undefined,
            }),
            plugins,
        });
    }

    // [5] mysql: MySQL Driver
    if (driver === 'mysql') {
        const url = process.env.DB_CONNECTION;
        if (!url) throw new Error("DB_DRIVER=mysql requires DB_CONNECTION to be set");

        console.log(`[DB] Kysely Provider: mysql`);

        const { MysqlDialect } = require('kysely');
        const { createPool } = require('mysql2');

        return new Kysely<Database>({
            dialect: new MysqlDialect({
                pool: createPool(url),
            }),
            plugins,
        });
    }

    // [6] postgres: PostgreSQL Driver
    if (driver === 'postgres') {
        const url = process.env.DB_CONNECTION;
        if (!url) throw new Error("DB_DRIVER=postgres requires DB_CONNECTION to be set");

        console.log(`[DB] Kysely Provider: postgres`);

        const { PostgresDialect } = require('kysely');
        const { Pool } = require('pg');

        return new Kysely<Database>({
            dialect: new PostgresDialect({
                pool: new Pool({
                    connectionString: url,
                }),
            }),
            plugins,
        });
    }

    // [7] mssql: SQL Server (via tedious + tarn)
    if (driver === 'mssql') {
        const connectionString = process.env.DB_CONNECTION;
        if (!connectionString) throw new Error("DB_DRIVER=mssql requires DB_CONNECTION to be set (mssql://user:password@host:port/database)");

        console.log(`[DB] Kysely Provider: mssql`);

        const { MssqlDialect } = require('kysely');
        const tedious = require('tedious');
        const tarn = require('tarn');

        // Parse connection string manually since tedious doesn't support it standardly
        const url = new URL(connectionString);
        const database = url.pathname.slice(1); // Remove leading slash

        return new Kysely<Database>({
            dialect: new MssqlDialect({
                tarn: {
                    ...tarn,
                    options: { min: 0, max: 10 }
                },
                tedious: {
                    ...tedious,
                    connectionFactory: () => new tedious.Connection({
                        authentication: {
                            type: 'default',
                            options: {
                                userName: url.username,
                                password: url.password,
                            }
                        },
                        server: url.hostname,
                        options: {
                            port: url.port ? parseInt(url.port) : 1433,
                            database: database,
                            trustServerCertificate: true, // Often needed for local dev/self-signed certs
                        }
                    })
                }
            }),
            plugins,
        });
    }

    throw new Error(`Unknown DB_DRIVER: ${driver}`);
}

// Default export uses process.env
export const db = createDatabase();
