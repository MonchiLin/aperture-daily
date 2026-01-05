import { Database } from 'bun:sqlite';
const db = new Database('local.db');

try {
    console.log("Adding structure_json column to article_variants...");
    db.run("ALTER TABLE article_variants ADD COLUMN structure_json text");
    console.log("Success.");
} catch (e: any) {
    if (e.message.includes('duplicate column name')) {
        console.log("Column already exists.");
    } else {
        console.error("Failed:", e);
    }
}
