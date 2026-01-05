import { Database } from 'bun:sqlite';
const db = new Database('local.db');

const articleId = 'eddc8874-1f7e-4559-ae39-f3d6dd01b004';
const row = db.query("SELECT structure_json FROM article_variants WHERE article_id = ? LIMIT 1").get(articleId) as any;

if (row && row.structure_json) {
    console.log("SUCCESS: Structure data found!");
    console.log("Size:", row.structure_json.length);
} else {
    console.error("FAILURE: Structure data missing.");
}
