import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('profile_sources')
        .addColumn('profile_id', 'text', (col) => col.notNull().references('generation_profiles.id').onDelete('cascade'))
        .addColumn('source_id', 'text', (col) => col.notNull().references('news_sources.id').onDelete('cascade'))
        .addPrimaryKeyConstraint('profile_sources_pk', ['profile_id', 'source_id'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('profile_sources').execute();
}
