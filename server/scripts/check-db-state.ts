import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

async function check() {
    console.log('Checking tables...');
    const tables = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table'`);
    console.log('Tables:', tables.map((t: any) => t.name).join(', '));

    console.log('\nChecking indexes for daily_word_references...');
    const indexes = await db.all(sql`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='daily_word_references'`);
    console.log('Indexes:', indexes.map((t: any) => t.name).join(', '));
}

check();
