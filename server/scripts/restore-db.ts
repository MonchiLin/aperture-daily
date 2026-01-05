import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import * as fs from 'fs/promises';
import * as path from 'path';

const BACKUP_DIR = path.join(__dirname, '../backups');

async function restore() {
    console.log('♻️ Starting Database Restore (Drizzle SQL Mode)...');

    // Disable FKs
    await db.run(sql.raw('PRAGMA foreign_keys = OFF'));

    const tables = [
        'generation_profiles',

        'words',
        'tasks',
        'articles',
        'highlights',
        'article_word_index',
        // 'daily_word_references' - New table, no backup needed/exists
    ];

    try {
        for (const table of tables) {
            console.log(`Importing ${table}...`);
            try {
                const filePath = path.join(BACKUP_DIR, `${table}.json`);
                const content = await fs.readFile(filePath, 'utf-8');
                const rows = JSON.parse(content);

                if (rows.length === 0) {
                    console.log(`Skipping ${table} (empty)`);
                    continue;
                }

                let success = 0;
                let fail = 0;

                for (const row of rows) {
                    try {
                        const keys = Object.keys(row);

                        // Construct SQL: INSERT INTO "table" ("col1", "col2") VALUES (${val1}, ${val2})
                        // 1. Column names: raw strings with quotes
                        const colChunks = keys.map(k => sql.raw(`"${k}"`));

                        // 2. Values: use sql`${val}` to create bound parameters
                        const valChunks = keys.map(k => sql`${row[k]}`);

                        const query = sql`INSERT INTO ${sql.raw(`"${table}"`)} 
                                          (${sql.join(colChunks, sql.raw(', '))}) 
                                          VALUES (${sql.join(valChunks, sql.raw(', '))})`;

                        await db.run(query);
                        success++;
                    } catch (e: any) {
                        // Ignore duplicate errors if we re-run
                        if (e.message.includes('UNIQUE constraint failed') || e.message.includes('unique constraint')) {
                            // skip
                        } else {
                            console.error(`Failed row in ${table}:`, e.message);
                            fail++;
                        }
                    }
                }

                console.log(`✅ Restored ${success} rows to ${table} (Failed: ${fail})`);
            } catch (e: any) {
                if (e.code === 'ENOENT') {
                    console.log(`Skipping ${table} (no backup)`);
                } else {
                    console.error(`❌ Failed to restore ${table}:`, e.message);
                }
            }
        }
    } finally {
        await db.run(sql.raw('PRAGMA foreign_keys = ON'));
    }
}

restore();
