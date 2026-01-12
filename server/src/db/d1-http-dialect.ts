/**
 * Kysely D1 HTTP Dialect
 * 
 * 通过 Cloudflare REST API 访问 D1 数据库，适用于非 Workers 环境（如 Docker）。
 * D1 禁止访问 sqlite_master，因此使用 PRAGMA 来实现 introspection。
 * 
 * @see https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 */

import {
    CompiledQuery,
    Kysely,
    SqliteAdapter,
    SqliteQueryCompiler,
    sql,
} from 'kysely';
import type {
    DatabaseConnection,
    DatabaseIntrospector,
    DatabaseMetadata,
    DatabaseMetadataOptions,
    Dialect,
    DialectAdapter,
    Driver,
    QueryCompiler,
    QueryResult,
    SchemaMetadata,
    TableMetadata,
    TransactionSettings,
} from 'kysely';

export interface D1HttpConfig {
    accountId: string;
    databaseId: string;
    apiToken: string;
}

interface D1ApiResponse {
    success: boolean;
    errors: Array<{ code: number; message: string }>;
    messages: string[];
    result: Array<{
        success: boolean;
        results: Record<string, unknown>[];
        meta: {
            served_by: string;
            duration: number;
            changes: number;
            last_row_id: number;
            changed_db: boolean;
            size_after: number;
            rows_read: number;
            rows_written: number;
        };
    }>;
}

class D1HttpConnection implements DatabaseConnection {
    readonly #config: D1HttpConfig;

    constructor(config: D1HttpConfig) {
        this.#config = config;
    }

    async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
        const { accountId, databaseId, apiToken } = this.#config;
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sql: compiledQuery.sql,
                params: compiledQuery.parameters,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`D1 HTTP API error (${response.status}): ${text}`);
        }

        const data = await response.json() as D1ApiResponse;

        if (!data.success) {
            const errorMessages = data.errors.map(e => e.message).join(', ');
            throw new Error(`D1 query failed: ${errorMessages}`);
        }

        // D1 API 返回结果数组，取第一个结果
        const result = data.result[0];

        if (!result || !result.success) {
            throw new Error('D1 query returned no result');
        }

        return {
            rows: result.results as R[],
            numAffectedRows: result.meta?.changes != null
                ? BigInt(result.meta.changes)
                : undefined,
            insertId: result.meta?.last_row_id != null
                ? BigInt(result.meta.last_row_id)
                : undefined,
        };
    }

    // D1 HTTP API 不支持流式查询
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
        throw new Error('D1 HTTP dialect does not support streaming');
    }
}

class D1HttpDriver implements Driver {
    readonly #config: D1HttpConfig;

    constructor(config: D1HttpConfig) {
        this.#config = config;
    }

    async init(): Promise<void> {
        // 无需初始化
    }

    async acquireConnection(): Promise<DatabaseConnection> {
        return new D1HttpConnection(this.#config);
    }

    async beginTransaction(
        _connection: DatabaseConnection,
        _settings: TransactionSettings
    ): Promise<void> {
        // D1 HTTP API 不支持显式事务控制
        // 每个 HTTP 请求都是独立的，无法跨请求维护事务状态
        // 这里静默忽略，依赖 D1 的单语句原子性
    }

    async commitTransaction(_connection: DatabaseConnection): Promise<void> {
        // 静默忽略 - D1 HTTP 不支持显式事务
    }

    async rollbackTransaction(_connection: DatabaseConnection): Promise<void> {
        // 静默忽略 - D1 HTTP 不支持显式事务
    }

    async releaseConnection(): Promise<void> {
        // HTTP 连接无需释放
    }

    async destroy(): Promise<void> {
        // 无需销毁
    }
}

/**
 * D1 专用 Introspector
 * 
 * D1 HTTP API 禁止访问 sqlite_master/sqlite_schema，
 * 使用 PRAGMA table_list 替代（SQLite 3.37+ 支持）。
 */
class D1HttpIntrospector implements DatabaseIntrospector {
    readonly #db: Kysely<unknown>;

    constructor(db: Kysely<unknown>) {
        this.#db = db;
    }

    async getSchemas(): Promise<SchemaMetadata[]> {
        // SQLite 不支持多 schema
        return [];
    }

    async getTables(options?: DatabaseMetadataOptions): Promise<TableMetadata[]> {
        // 使用 PRAGMA table_list 获取表列表（D1 支持此命令）
        const { rows } = await sql<{ name: string; type: string }>`PRAGMA table_list`.execute(this.#db);

        const tables: TableMetadata[] = [];

        for (const row of rows) {
            // 过滤掉内部表（如 sqlite_sequence）和 view（如果不需要）
            if (row.name.startsWith('sqlite_') || row.name.startsWith('_cf_')) {
                continue;
            }

            // 如果只需要表名，不获取列信息
            if (options?.withInternalKyselyTables === false && row.name.startsWith('kysely_')) {
                continue;
            }

            const columns = await this.#getTableColumns(row.name);

            tables.push({
                name: row.name,
                isView: row.type === 'view',
                columns,
            });
        }

        return tables;
    }

    async #getTableColumns(tableName: string) {
        const { rows } = await sql<{
            cid: number;
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
        }>`PRAGMA table_info(${sql.raw(tableName)})`.execute(this.#db);

        return rows.map(col => ({
            name: col.name,
            dataType: col.type,
            isNullable: col.notnull === 0,
            isAutoIncrementing: col.pk === 1 && col.type.toUpperCase() === 'INTEGER',
            hasDefaultValue: col.dflt_value !== null,
            comment: undefined,
        }));
    }

    async getMetadata(_options?: DatabaseMetadataOptions): Promise<DatabaseMetadata> {
        return {
            tables: await this.getTables(_options),
        };
    }
}

export class D1HttpDialect implements Dialect {
    readonly #config: D1HttpConfig;

    constructor(config: D1HttpConfig) {
        this.#config = config;
    }

    createDriver(): Driver {
        return new D1HttpDriver(this.#config);
    }

    createQueryCompiler(): QueryCompiler {
        return new SqliteQueryCompiler();
    }

    createAdapter(): DialectAdapter {
        return new SqliteAdapter();
    }

    createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
        // 使用自定义 Introspector，避免访问 sqlite_master
        return new D1HttpIntrospector(db);
    }
}
