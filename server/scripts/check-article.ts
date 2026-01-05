import Database from 'better-sqlite3';

const db = new Database('./local.db');
const row = db.prepare('SELECT content_json FROM articles WHERE id = ?').get('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any;

if (!row) {
    console.log('Article not found');
    process.exit(1);
}

const parsed = JSON.parse(row.content_json);
const level1 = parsed.result.articles.find((a: any) => a.level === 1);

console.log('=== Level 1 Content ===');
console.log(level1.content);
console.log('\n=== Level 1 Structure ===');
console.log(JSON.stringify(level1.structure, null, 2));

// Also show what text the O role should cover
const oRoles = level1.structure?.filter((s: any) => s.role === 'o') || [];
console.log('\n=== O (Object) Roles ===');
oRoles.forEach((o: any, i: number) => {
    console.log(`O[${i}]: start=${o.start}, end=${o.end}, extract="${o.extract || level1.content.substring(o.start, o.end)}"`);
});

db.close();
