import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

async function checkSchema() {
    const res = await db.all(sql`SELECT sql FROM sqlite_master WHERE name='daily_word_references'`);
    console.log('Daily Word References Schema:', res[0]?.sql);

    // Check generation profiles too just in case
    const res2 = await db.all(sql`SELECT sql FROM sqlite_master WHERE name='generation_profiles'`);
    console.log('Generation Profiles Schema:', res2[0]?.sql);
}

checkSchema();
