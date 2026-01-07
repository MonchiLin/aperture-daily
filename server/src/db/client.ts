import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { drizzle as drizzleBun } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from '../../db/schema';
import * as path from 'path';
import { mapKeys, camelCase } from 'lodash-es';

// Re-export the database type for use across the app
export type AppDatabase = SqliteRemoteDatabase<typeof schema> | BunSQLiteDatabase<typeof schema>;

// Configuration from env
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = process.env.CLOUDFLARE_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// Check if we have D1 credentials
const useD1 = !!(ACCOUNT_ID && DATABASE_ID && API_TOKEN);

interface D1Response {
    success: boolean;
    errors?: Array<{ message: string }>;
    result?: Array<{ results: unknown[] }>;
}

function createDatabase(): AppDatabase {
    if (!useD1) {
        // Local SQLite for development
        // Resolve absolute path to avoid CWD issues
        const dbPath = path.resolve(import.meta.dir, '../../local.db');
        console.log(`[DB] Using local SQLite (${dbPath})`);
        const sqlite = new Database(dbPath);
        return drizzleBun(sqlite, { schema });
    }

    // Cloudflare D1 HTTP Proxy for production
    console.log(`[DB] Using Cloudflare D1 (HTTP Proxy) - Account: ${ACCOUNT_ID}, DB: ${DATABASE_ID}`);

    return drizzle(async (sql, params) => {
        const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;


        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sql: sql,
                    params: params
                })
            });

            const text = await response.text();
            let data: D1Response;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error(`Failed to parse D1 response: ${text.slice(0, 100)}...`);
            }

            if (!data.success) {
                console.error('D1 API Error (Detailed):', JSON.stringify(data.errors, null, 2));
                throw new Error(`D1 API Error: ${data.errors?.[0]?.message || 'Unknown error'}`);
            }

            const firstResult = data.result?.[0];
            const rawRows = (firstResult?.results || []) as Record<string, unknown>[];

            // D1 returns snake_case, Drizzle schema uses camelCase
            const rows = rawRows.map(row => mapKeys(row, (_, key) => camelCase(key)));

            return { rows };
        } catch (e) {
            console.error("D1 Proxy Fetch Error:", e);
            throw e;
        }
    }, { schema });
}

export const db = createDatabase();

// Helper to check connection type
export const isD1 = useD1;
