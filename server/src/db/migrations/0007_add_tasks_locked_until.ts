import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('tasks')
        .addColumn('locked_until', 'text') // SQLite stores dates as text
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('tasks')
        .dropColumn('locked_until')
        .execute();
}
