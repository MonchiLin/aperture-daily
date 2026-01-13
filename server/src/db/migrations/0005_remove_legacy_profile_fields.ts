
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // SQLite's ALTER TABLE DROP COLUMN can fail if there are triggers or constraints
    // Use the table rebuild approach instead
    await sql`
        CREATE TABLE generation_profiles_new (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `.execute(db);

    await sql`
        INSERT INTO generation_profiles_new (id, name, created_at, updated_at)
        SELECT id, name, created_at, updated_at FROM generation_profiles
    `.execute(db);

    await sql`DROP TABLE generation_profiles`.execute(db);
    await sql`ALTER TABLE generation_profiles_new RENAME TO generation_profiles`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.alterTable('generation_profiles')
        .addColumn('topic_preference', 'text')
        .execute();
    await db.schema.alterTable('generation_profiles')
        .addColumn('concurrency', 'integer', (col) => col.defaultTo(1))
        .execute();
    await db.schema.alterTable('generation_profiles')
        .addColumn('timeout_ms', 'integer', (col) => col.defaultTo(3600000))
        .execute();
}
