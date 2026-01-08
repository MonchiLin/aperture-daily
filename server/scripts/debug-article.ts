#!/usr/bin/env bun
/**
 * Debug Script: 查询文章数据
 * 
 * Usage: bun run scripts/debug-article.ts
 */

import { Database } from "bun:sqlite";

const LOCAL_DB_PATH = "./local.db";
const ARTICLE_TITLE = "Ancient Skeletons Reveal Secrets of Early Farmers in Türkiye";

const db = new Database(LOCAL_DB_PATH, { readonly: true });

console.log("=".repeat(60));
console.log("📰 Searching for article:", ARTICLE_TITLE);
console.log("=".repeat(60));

// 1. 查找文章
const article = db.query(`
    SELECT 
        a.id,
        a.title,
        a.slug,
        a.source_url,
        a.status,
        a.generation_task_id,
        a.created_at,
        t.task_date
    FROM articles a
    LEFT JOIN tasks t ON a.generation_task_id = t.id
    WHERE a.title LIKE ?
    LIMIT 1
`).get(`%${ARTICLE_TITLE.substring(0, 30)}%`) as any;

if (!article) {
    console.log("❌ Article NOT FOUND in database!");

    // 列出最新的 5 篇文章
    console.log("\n📋 Latest 5 articles in database:");
    const latestArticles = db.query(`
        SELECT a.id, a.title, a.slug, t.task_date 
        FROM articles a
        LEFT JOIN tasks t ON a.generation_task_id = t.id
        ORDER BY a.created_at DESC
        LIMIT 5
    `).all() as any[];

    latestArticles.forEach((a, i) => {
        console.log(`   ${i + 1}. [${a.task_date}] ${a.title}`);
        console.log(`      slug: ${a.slug || "(empty)"}`);
    });

    db.close();
    process.exit(1);
}

console.log("\n✅ Article found:");
console.log("   ID:", article.id);
console.log("   Title:", article.title);
console.log("   Slug:", article.slug || "(EMPTY ⚠️)");
console.log("   Task Date:", article.task_date);
console.log("   Status:", article.status);
console.log("   Created:", article.created_at);

// 2. 检查 slug 是否为空
if (!article.slug) {
    console.log("\n⚠️  WARNING: Article slug is EMPTY!");
    console.log("   This will cause 404 error.");
}

// 3. 构造预期的 URL
const expectedUrl = `/${article.task_date}/${article.slug || "___MISSING___"}`;
console.log("\n🔗 Expected URL:", expectedUrl);

// 4. 检查 article_variants
const variants = db.query(`
    SELECT id, level, level_label, LENGTH(content) as content_length
    FROM article_variants
    WHERE article_id = ?
    ORDER BY level
`).all(article.id) as any[];

console.log("\n📊 Article Variants:");
if (variants.length === 0) {
    console.log("   ❌ No variants found!");
} else {
    variants.forEach(v => {
        console.log(`   L${v.level} (${v.level_label}): ${v.content_length} chars`);
    });
}

// 5. 检查 vocabulary
const vocabCount = db.query(`
    SELECT COUNT(*) as count FROM article_vocabulary WHERE article_id = ?
`).get(article.id) as any;

console.log("\n📚 Vocabulary:", vocabCount.count, "words");

// 6. 测试 lookup 查询 (模拟前端请求)
console.log("\n🔍 Testing lookup query (simulating frontend request):");
const lookupResult = db.query(`
    SELECT a.id 
    FROM articles a
    JOIN tasks t ON a.generation_task_id = t.id
    WHERE t.task_date = ? AND a.slug = ?
    LIMIT 1
`).get(article.task_date, article.slug) as any;

if (lookupResult) {
    console.log("   ✅ Lookup successful! Article ID:", lookupResult.id);
} else {
    console.log("   ❌ Lookup FAILED!");
    console.log("   Reason: Cannot find article with date='" + article.task_date + "' and slug='" + article.slug + "'");
}

// 7. 对比前端 slug 生成逻辑
console.log("\n🔬 Comparing slug generation logic:");

const title = article.title;

// Frontend logic (from src/lib/articles/loader.ts)
const frontendSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

console.log("   Backend slug (DB):", article.slug);
console.log("   Frontend slug    :", frontendSlug);

if (article.slug !== frontendSlug) {
    console.log("\n⚠️  MISMATCH DETECTED!");
    console.log("   The frontend generates a different slug than what's stored in DB.");
    console.log("   This causes 404 because the lookup query won't match.");

    // Find problematic characters
    console.log("\n   Problematic characters in title:");
    for (const char of title) {
        if (!/[\w\s\u4e00-\u9fa5-]/.test(char)) {
            console.log(`      '${char}' (U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
        }
    }
} else {
    console.log("   ✅ Slugs match!");
}

console.log("\n" + "=".repeat(60));
db.close();
