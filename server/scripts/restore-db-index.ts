import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

async function restoreIndex() {
    console.log('Restoring index uq_daily_word_ref...');
    try {
        await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_word_ref ON daily_word_references (date, word)`);
        console.log('✅ Restored uq_daily_word_ref');
    } catch (e) {
        console.error('Failed to restore index:', e);
    }
}

restoreIndex();
