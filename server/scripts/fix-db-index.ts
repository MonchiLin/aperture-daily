import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

async function fix() {
    console.log('Dropping index uq_daily_word_ref...');
    try {
        await db.run(sql`DROP INDEX IF EXISTS uq_daily_word_ref`);
        console.log('✅ Dropped uq_daily_word_ref');
    } catch (e) {
        console.error('Failed to drop index:', e);
    }
}

fix();
