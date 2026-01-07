/**
 * Cleanup Script: Delete articles with missing critical fields
 * Run via: bun run scripts/cleanup-dirty-articles.ts
 */
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

async function cleanupDirtyArticles() {
    console.log('🧹 Cleaning up dirty articles...');

    // Find articles with missing generation_task_id or title
    const dirtyArticles = await db.all(sql`
        SELECT id, title, generation_task_id 
        FROM articles 
        WHERE generation_task_id IS NULL 
           OR generation_task_id = '' 
           OR title IS NULL 
           OR title = ''
    `) as { id: string; title: string | null; generation_task_id: string | null }[];

    console.log(`Found ${dirtyArticles.length} dirty article(s):`);
    dirtyArticles.forEach(a => {
        console.log(`  - ${a.id}: title="${a.title || '(empty)'}", task_id="${a.generation_task_id || '(empty)'}"`);
    });

    if (dirtyArticles.length === 0) {
        console.log('✅ No dirty articles found. Database is clean.');
        return;
    }

    // Delete related data first (cascade doesn't always work with raw SQL)
    for (const article of dirtyArticles) {
        console.log(`Deleting article ${article.id}...`);
        await db.run(sql`DELETE FROM article_vocab_definitions WHERE vocab_id IN (SELECT id FROM article_vocabulary WHERE article_id = ${article.id})`);
        await db.run(sql`DELETE FROM article_vocabulary WHERE article_id = ${article.id}`);
        await db.run(sql`DELETE FROM article_variants WHERE article_id = ${article.id}`);
        await db.run(sql`DELETE FROM article_word_index WHERE article_id = ${article.id}`);
        await db.run(sql`DELETE FROM highlights WHERE article_id = ${article.id}`);
        await db.run(sql`DELETE FROM articles WHERE id = ${article.id}`);
    }

    console.log(`✅ Deleted ${dirtyArticles.length} dirty article(s).`);
}

cleanupDirtyArticles().catch(console.error);
