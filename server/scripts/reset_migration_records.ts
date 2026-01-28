import Database from 'bun:sqlite';

const db = new Database('./local.db');

console.log('=== Before ===');
console.log(db.query('SELECT * FROM kysely_migration').all());

// 清空并重置迁移记录
db.run('DELETE FROM kysely_migration');
db.run("INSERT INTO kysely_migration (name, timestamp) VALUES ('0001_initial_setup', datetime('now'))");

console.log('\n=== After ===');
console.log(db.query('SELECT * FROM kysely_migration').all());

db.close();
console.log('\n✅ Migration records reset successfully!');
