import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('tasks')
        .addColumn('context_json', 'text') // SQLite stores JSON as text
        .execute();

    // Add check constraint for valid JSON if possible, but SQLite alter table has liimits.
    // We'll skip the constraint for now to be safe with SQLite limitations on ALTER TABLE.
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('tasks')
        .dropColumn('context_json')
        .execute();
}
