
import { db } from '../src/db/factory';

async function main() {
    const article = await db.selectFrom('articles')
        .select(['slug', 'created_at'])
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

    if (article) {
        console.log(article.slug);
    } else {
        console.error("No articles found");
    }
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
