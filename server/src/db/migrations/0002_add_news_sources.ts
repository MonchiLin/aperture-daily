import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // 1. News Sources
    await db.schema
        .createTable('news_sources')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('url', 'text', (col) => col.notNull())
        .addColumn('is_active', 'integer', (col) => col.defaultTo(1).notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .execute();

    await db.schema.createIndex('uq_news_sources_url').ifNotExists().on('news_sources').column('url').unique().execute();

    // 2. Topic Sources (Junction Table)
    await db.schema
        .createTable('topic_sources')
        .ifNotExists()
        .addColumn('topic_id', 'text', (col) => col.notNull().references('topics.id').onDelete('cascade'))
        .addColumn('source_id', 'text', (col) => col.notNull().references('news_sources.id').onDelete('cascade'))
        .addPrimaryKeyConstraint('pk_topic_sources', ['topic_id', 'source_id'])
        .execute();

    await db.schema.createIndex('idx_topic_sources_topic_id').ifNotExists().on('topic_sources').column('topic_id').execute();
    await db.schema.createIndex('idx_topic_sources_source_id').ifNotExists().on('topic_sources').column('source_id').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('topic_sources').ifExists().execute();
    await db.schema.dropTable('news_sources').ifExists().execute();
}
