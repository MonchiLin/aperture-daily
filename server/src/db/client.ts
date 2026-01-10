import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { drizzle as drizzleBun } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from '../../db/schema';
import * as path from 'path';

// 统一数据库类型：无论底层是本地 SQLite 文件还是 Cloudflare D1 HTTP API，
// 应用层都通过这个类型进行无感操作。
export type AppDatabase = SqliteRemoteDatabase<typeof schema> | BunSQLiteDatabase<typeof schema>;

// 配置来源：环境变量
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = process.env.CLOUDFLARE_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// 检查是否具备连接 D1 的凭证
const useD1 = !!(ACCOUNT_ID && DATABASE_ID && API_TOKEN);

interface D1Response {
    success: boolean;
    errors?: Array<{ message: string }>;
    result?: Array<{ results: unknown[] }>;
}

function createDatabase(): AppDatabase {
    if (!useD1) {
        // [Local Mode] 本地开发环境
        // 使用 bun:sqlite 原生驱动直接读写本地磁盘上的 .db 文件。
        // 优点：零网络延迟，更快的开发迭代速度。
        const dbPath = path.resolve(import.meta.dir, '../../local.db');
        console.log(`[DB] Using Local SQLite (Dev Mode): ${dbPath}`);
        const sqlite = new Database(dbPath);
        return drizzleBun(sqlite, { schema });
    }

    // [Production Mode] Cloudflare D1
    // 由于 Node.js/Bun 环境无法直接运行 D1 Binding (仅 Worker 环境可用)，
    // 我们使用 Cloudflare 提供的 REST API 作为连接隧道 (Tunnel)。
    // 这允许原本设计用于 Edge 的 D1 数据库也能被常驻服务器访问。
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
                throw new Error(`无法解析 D1 响应: ${text.slice(0, 100)}...`);
            }

            if (!data.success) {
                console.error('D1 API Error (详细):', JSON.stringify(data.errors, null, 2));
                throw new Error(`D1 API 错误: ${data.errors?.[0]?.message || '未知错误'}`);
            }

            const firstResult = data.result?.[0];
            const rows = (firstResult?.results || []) as Record<string, unknown>[];

            // 注意: 当使用 db.select().from(table) 时，Drizzle 会在内部处理
            // 列名映射 (snake_case -> camelCase)。
            // 这里我们应该从 D1 返回原始的 snake_case 列名。

            return { rows };
        } catch (e) {
            console.error("D1 Proxy Fetch Error:", e);
            throw e;
        }
    }, { schema });
}

export const db = createDatabase();

// 辅助变量：检查连接类型
export const isD1 = useD1;
