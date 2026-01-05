import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';
import { dailyWordReferences } from '../db/schema';

const date = process.argv[2];
if (!date) {
    console.error('Usage: bun run scripts/clear-day-words.ts <YYYY-MM-DD>');
    process.exit(1);
}

async function clear() {
    console.log(`🗑️ Clearing words for date: ${date}...`);

    const result = await db.delete(dailyWordReferences)
        .where(sql`${dailyWordReferences.date} = ${date}`)
        .returning();

    console.log(`✅ Deleted ${result.length} entries.`);
}

clear().catch(console.error);
