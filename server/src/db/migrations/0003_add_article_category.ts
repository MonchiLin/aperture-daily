import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // Add 'category' column
    await db.schema
        .alterTable('articles')
        .addColumn('category', 'text')
        .execute();

    // Add index for fast querying/filtering
    await db.schema
        .createIndex('idx_articles_category')
        .on('articles')
        .column('category')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .dropIndex('idx_articles_category')
        .execute();

    await db.schema
        .alterTable('articles')
        .dropColumn('category')
        .execute();
}
