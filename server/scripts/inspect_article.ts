
console.log("Script starting...");
import { db } from '../src/db/factory';
import { sql } from 'kysely';

async function main() {
    console.log("Main function called");
    const fullPath = process.argv[2];
    if (!fullPath) {
        console.error('Please provide the article path (YYYY-MM-DD/slug)');
        process.exit(1);
    }

    const [date, ...slugParts] = fullPath.split('/');
    const slug = slugParts.join('/');

    console.log(`[Inspector] Looking for article: ${slug} (Date: ${date})`);

    const article = await db.selectFrom('articles')
        .selectAll()
        .where('slug', '=', slug)
        //.where(sql`date(created_at)`, '=', date) // created_at might include time, strict equality might fail if logic differs. 
        // relying on slug for now as it should be unique enough or I can check recent ones.
        .executeTakeFirst();

    if (!article) {
        console.error('Article not found.');
        process.exit(1);
    }

    console.log(`\n=== Metadata ===`);
    console.log(`Title: ${article.title}`);
    console.log(`ID: ${article.id}`);
    console.log(`Status: ${article.status}`);
    console.log(`Source: ${article.source_url}`);

    const variants = await db.selectFrom('article_variants')
        .selectAll()
        .where('article_id', '=', article.id)
        .orderBy('level', 'desc') // L3 first
        .execute();

    console.log(`\n=== Variants (${variants.length}) ===`);
    for (const v of variants) {
        console.log(`\n--- Level ${v.level} (${v.level_label}) ---`);
        console.log(`Title: ${v.title}`);
        console.log(`Summary: ${v.summary || 'N/A'}`);
        console.log(`\nContent Snippet (First 500 chars):`);
        console.log(v.content.slice(0, 500) + '...');
        console.log(`\n[Full Content Length: ${v.content.length}]`);
    }

    process.exit(0);
}

main().catch(console.error);
