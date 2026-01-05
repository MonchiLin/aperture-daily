/**
 * 检查表结构
 */
import { Database } from 'bun:sqlite';

const db = new Database('./local.db');

console.log('=== articles 表结构 ===');
const articleCols = db.query('PRAGMA table_info(articles)').all() as any[];
articleCols.forEach(c => console.log(' -', c.name, c.type));

console.log('\n=== article_variants 表结构 ===');
const variantCols = db.query('PRAGMA table_info(article_variants)').all() as any[];
variantCols.forEach(c => console.log(' -', c.name, c.type));

db.close();
