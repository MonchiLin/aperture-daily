import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema';
import { sql } from 'drizzle-orm';

const sqlite = new Database('local.db');
const db = drizzle(sqlite, { schema });

const backupPath = 'backups/articles.json'; // Relative to server root

async function recover() {
    console.log(`Reading backup from ${backupPath}...`);
    let articlesData;
    try {
        const raw = readFileSync(backupPath, 'utf8');
        articlesData = JSON.parse(raw);
    } catch (e) {
        console.error("Failed to read backup:", e);
        return;
    }

    console.log(`Found ${articlesData.length} articles in backup.`);
    let restoredCount = 0;

    for (const backupArticle of articlesData) {
        if (!backupArticle.content_json) continue;

        try {
            const content = JSON.parse(backupArticle.content_json);
            const data = content.result || content;

            if (!data.articles) continue;

            for (const variant of data.articles) {
                if (!variant.structure) continue;

                // Update the variant in DB
                const result = await db.update(schema.articleVariants)
                    .set({ structureJson: JSON.stringify(variant.structure) })
                    .where(sql`${schema.articleVariants.articleId} = ${backupArticle.id} AND ${schema.articleVariants.level} = ${variant.level}`);

                // Drizzle update result wrapper isn't standard, but we can assume it worked if no error
            }
            restoredCount++;
        } catch (e) {
            console.error(`Error processing article ${backupArticle.id}:`, e);
        }
    }
    console.log(`Restored structure data for ${restoredCount} articles.`);
}

recover();
