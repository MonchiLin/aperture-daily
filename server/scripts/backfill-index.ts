
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';
import { indexArticleWords } from '../src/services/wordIndexer';

async function backfill() {
    console.log("🚀 Starting Backfill (Raw SQL Mode)...");

    try {
        // Use Raw SQL to avoid Drizzle mapping issues observed in this script context
        const rows: any[] = await db.all(sql`SELECT id, title, content_json, status FROM articles WHERE status = 'published'`);

        console.log(`Found ${rows.length} published articles.`);

        if (rows.length === 0) {
            console.log("Nothing to index.");
            return;
        }

        let successCount = 0;
        let failCount = 0;

        for (const row of rows) {
            // Raw D1 results use snake_case
            const id = row.id;
            const title = row.title;
            const contentJsonStr = row.content_json;

            if (!id || !contentJsonStr) {
                console.warn(`Skipping row with missing data: ID=${id}`);
                failCount++;
                continue;
            }

            try {
                const content = JSON.parse(contentJsonStr);
                // Call the indexer
                await indexArticleWords(id, content);
                successCount++;
                process.stdout.write('.');
            } catch (e) {
                console.error(`\n[Error] Failed to index article ${id} (${title}):`, e);
                failCount++;
            }
        }

        console.log("\n\n✅ Backfill Completed!");
        console.log(`Success: ${successCount}`);
        console.log(`Failed:  ${failCount}`);

    } catch (e) {
        console.error("Fatal Error during backfill:", e);
    }
}

backfill();
