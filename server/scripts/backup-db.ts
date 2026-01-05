import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import * as fs from 'fs/promises';
import * as path from 'path';

const BACKUP_DIR = path.join(__dirname, '../backups');

async function backup() {
    console.log('📦 Starting Database Backup...');
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // list of tables to backup
    const tables = [
        'generation_profiles',
        'tasks',

        'words',
        'articles',
        'highlights',
        'article_word_index' // existing table
    ];

    for (const table of tables) {
        console.log(`Exporting ${table}...`);
        try {
            const rows = await db.all(sql.raw(`SELECT * FROM ${table}`));
            await fs.writeFile(
                path.join(BACKUP_DIR, `${table}.json`),
                JSON.stringify(rows, null, 2)
            );
            console.log(`✅ Saved ${rows.length} rows from ${table}`);
        } catch (e: any) {
            console.warn(`⚠️ Failed to export ${table} (might not exist):`, e.message);
        }
    }
}

backup();
