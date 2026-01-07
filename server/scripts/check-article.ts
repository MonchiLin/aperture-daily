/**
 * Debug Script: Check specific article data in D1
 * Run via: bun run scripts/check-article.ts <article_id>
 */
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

const articleId = process.argv[2] || '1818f42c-9f36-4314-afd0-eb23aedd0f21';

async function checkArticle() {
    console.log(`🔍 Checking article: ${articleId}\n`);

    // 1. Check articles table
    const articles = await db.all(sql`
        SELECT id, title, generation_task_id, model, status, source_url 
        FROM articles 
        WHERE id = ${articleId}
    `) as any[];

    console.log('📄 Articles table:');
    if (articles.length === 0) {
        console.log('   ❌ NOT FOUND in articles table!');
    } else {
        console.log('   ✅ Found:', JSON.stringify(articles[0], null, 2));
    }

    // 2. Check article_variants
    const variants = await db.all(sql`
        SELECT id, level, level_label, title, LENGTH(content) as content_length
        FROM article_variants 
        WHERE article_id = ${articleId}
        ORDER BY level
    `) as any[];

    console.log('\n📚 Article Variants:');
    if (variants.length === 0) {
        console.log('   ⚠️ NO VARIANTS found! (This would cause article to appear empty)');
    } else {
        variants.forEach(v => {
            console.log(`   L${v.level}: "${v.title}" (${v.content_length} chars)`);
        });
    }

    // 3. Check tasks (if generation_task_id exists)
    if (articles.length > 0 && articles[0].generation_task_id) {
        const taskId = articles[0].generation_task_id;
        const tasks = await db.all(sql`
            SELECT id, status, task_date 
            FROM tasks 
            WHERE id = ${taskId}
        `) as any[];

        console.log('\n📋 Related Task:');
        if (tasks.length === 0) {
            console.log(`   ⚠️ Task ${taskId} NOT FOUND!`);
        } else {
            console.log('   ✅ Found:', JSON.stringify(tasks[0], null, 2));
        }
    }

    // 4. Check vocabulary
    const vocab = await db.all(sql`
        SELECT COUNT(*) as count FROM article_vocabulary WHERE article_id = ${articleId}
    `) as any[];
    console.log(`\n📝 Vocabulary count: ${vocab[0]?.count || 0}`);
}

checkArticle().catch(console.error);
