import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('article_variants')
        .addColumn('pull_quote', 'text')
        .execute();

    await db.schema
        .alterTable('article_variants')
        .addColumn('summary', 'text')
        .execute();
}

export async function down(_db: Kysely<any>): Promise<void> {
    // SQLite does not support dropping columns easily, usually requires table recreation.
    // For simplicity in this dev environment, we skip strict down migration or would need complex logic.
    // Leaving empty as "irreversible" for now regarding column drop without data loss logic.
}
