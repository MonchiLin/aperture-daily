
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

async function verify() {
    console.log("Verifying articles table columns...");
    try {
        const result: any = await db.all(sql`PRAGMA table_info(articles)`);
        const columns = Array.isArray(result) ? result : (result.rows || []);

        const hasReadLevels = columns.some((col: any) => col.name === 'read_levels');

        console.log("Columns found:", columns.map((c: any) => c.name).join(', '));
        if (hasReadLevels) {
            console.log("✅ SUCCESS: 'read_levels' column exists.");
        } else {
            console.error("❌ FAILURE: 'read_levels' column is MISSING.");
        }
    } catch (e) {
        console.error("Verification failed:", e);
    }
}

verify();
