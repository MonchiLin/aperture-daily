import { Database } from 'bun:sqlite';
const db = new Database('local.db');
const indexes = db.query(`PRAGMA index_list("daily_word_references")`).all();
console.log(JSON.stringify(indexes, null, 2));
