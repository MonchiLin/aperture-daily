
import { Database } from 'bun:sqlite';

// We'll use raw sqlite for simplicity in script if db export is complex, 
// but let's try to use the project structure if possible. 
// Actually, for a script, direct DB access is often easier to avoid full app/elysia init overhead.
const sqlite = new Database('local.db');

// Slugify function matching the plan
function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s\u4e00-\u9fa5-]/g, '') // Keep letters, numbers, chinese, spaces, hyphens
        .replace(/[\s_-]+/g, '-')              // Replace spaces/underscores with hyphens
        .replace(/^-+|-+$/g, '');              // Trim leading/trailing hyphens
}

console.log("Starting backfill...");

// Check if slug column exists
try {
    sqlite.query("SELECT slug FROM articles LIMIT 1").get();
} catch (e) {
    console.log("Adding 'slug' column to articles table...");
    sqlite.run("ALTER TABLE articles ADD COLUMN slug TEXT");
}

const rows = sqlite.query("SELECT id, title FROM articles WHERE slug IS NULL").all() as { id: string, title: string }[];

console.log(`Found ${rows.length} articles to update.`);

const updateStmt = sqlite.prepare("UPDATE articles SET slug = ? WHERE id = ?");

let updatedCount = 0;
sqlite.transaction(() => {
    for (const row of rows) {
        if (!row.title) continue;
        const slug = slugify(row.title);
        console.log(`Updating "${row.title}" -> "${slug}"`);
        updateStmt.run(slug, row.id);
        updatedCount++;
    }
})();

console.log(`Backfill completed. Updated ${updatedCount} articles.`);
