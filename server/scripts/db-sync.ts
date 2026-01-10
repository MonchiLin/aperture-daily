#!/usr/bin/env bun
/**
 * D1 Database Sync Engine (D1 数据库同步引擎)
 * 
 * 核心功能：
 * 用于在 "Local Dev DB" (本地 Bun SQLite) 和 "Remote Production DB" (Cloudflare D1) 之间同步全量数据。
 * 
 * 为什么需要这个脚本？
 * Cloudflare D1 是分布式的，且在线上。本地开发时，我们需要一个真实的、包含数据的数据库环境。
 * 手动导入导出 SQL 非常繁琐且容易出错（例如 D1 的 SQL 语法与本地 SQLite 的微小差异）。
 * 
 * 工作流 (Workflow):
 * 1. Pull: Remote -> Local (常用于：同步线上数据开发新功能)
 * 2. Push: Local -> Remote (常用于：本地修复 Bug 或数据订正后发布，**高风险操作**)
 * 3. Export: Remote -> SQL File (用于备份)
 * 
 * 技术细节：
 * - 自动过滤 `sqlite_sequence` 表，防止自增 ID 序列冲突。
 * - 使用 PRAGMA foreign_keys=OFF 暂时禁用外键约束，以避免因插入顺序导致的约束错误。
 */

import { $ } from "bun";
import { Database } from "bun:sqlite";
import * as fs from "fs";

const DB_NAME = process.env.CLOUDFLARE_DATABASE_NAME;

if (!DB_NAME) {
    console.error("Error: CLOUDFLARE_DATABASE_NAME environment variable is not set.");
    process.exit(1);
}

const LOCAL_DB_PATH = "./local.db";
const BACKUP_FILE = "./backup.sql";

const command = process.argv[2];

async function pull() {
    console.log("📥 Pulling data from remote D1 to local SQLite...");

    // Export from remote D1
    console.log(`   Exporting from remote D1 (${DB_NAME})...`);
    await $`npx wrangler d1 export ${DB_NAME} --remote --output=${BACKUP_FILE}`.quiet();

    // Delete existing local.db
    console.log(`   Recreating local SQLite (${LOCAL_DB_PATH})...`);
    if (fs.existsSync(LOCAL_DB_PATH)) {
        fs.unlinkSync(LOCAL_DB_PATH);
    }

    // Read backup SQL and execute using Bun's SQLite
    console.log(`   Importing SQL to local SQLite...`);
    let sqlContent = fs.readFileSync(BACKUP_FILE, "utf-8");

    // Filter out sqlite_sequence statements (internal SQLite table that may not exist in fresh DB)
    sqlContent = sqlContent
        .split('\n')
        .filter(line => !line.toLowerCase().includes('sqlite_sequence'))
        .join('\n');

    const db = new Database(LOCAL_DB_PATH);

    // Execute the SQL statements
    db.exec(sqlContent);
    db.close();

    // Clean up backup file
    fs.unlinkSync(BACKUP_FILE);

    console.log("✅ Pull complete! Local database synced with remote D1.");
}

async function push() {
    console.log("📤 Pushing local SQLite data to remote D1...");
    console.log("⚠️  WARNING: This will overwrite remote data!");

    // Export local SQLite to SQL using Bun
    console.log(`   Exporting local SQLite to SQL...`);
    const db = new Database(LOCAL_DB_PATH);

    // Get all tables
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];

    let sqlDump = "PRAGMA foreign_keys=OFF;\n";

    for (const { name } of tables) {
        // Get CREATE TABLE statement
        const createStmt = db.query(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(name) as { sql: string } | null;
        if (createStmt?.sql) {
            sqlDump += `DROP TABLE IF EXISTS "${name}";\n`;
            sqlDump += `${createStmt.sql};\n`;
        }

        // Get all rows
        const rows = db.query(`SELECT * FROM "${name}"`).all();
        for (const row of rows) {
            const columns = Object.keys(row as object);
            const values = Object.values(row as object).map(v =>
                v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
            );
            sqlDump += `INSERT INTO "${name}" (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
        }
    }

    sqlDump += "PRAGMA foreign_keys=ON;\n";
    db.close();

    fs.writeFileSync(BACKUP_FILE, sqlDump);

    // Import to remote D1
    console.log(`   Importing to remote D1 (${DB_NAME})...`);
    await $`npx wrangler d1 execute ${DB_NAME} --remote --file=${BACKUP_FILE} --yes`.quiet();

    // Clean up
    fs.unlinkSync(BACKUP_FILE);

    console.log("✅ Push complete! Remote D1 synced with local database.");
}

async function exportBackup() {
    console.log("💾 Exporting remote D1 to backup file...");
    await $`npx wrangler d1 export ${DB_NAME} --remote --output=${BACKUP_FILE}`;
    console.log(`✅ Export complete! Saved to ${BACKUP_FILE}`);
}

async function main() {
    switch (command) {
        case "pull":
            await pull();
            break;
        case "push":
            await push();
            break;
        case "export":
            await exportBackup();
            break;
        default:
            console.log(`
D1 Database Sync Tool

Usage:
  bun run scripts/db-sync.ts pull    # Pull remote D1 → local.db
  bun run scripts/db-sync.ts push    # Push local.db → remote D1
  bun run scripts/db-sync.ts export  # Export remote D1 → backup.sql

Environment Variables:
  D1_DATABASE_NAME  Database name (default: ApertureDailyData)
`);
            process.exit(1);
    }
}

main().catch(console.error);
