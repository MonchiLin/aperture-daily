
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // 1. Create 'topics' table
    await db.schema
        .createTable('topics')
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('label', 'text', (col) => col.notNull()) // Display Name
        .addColumn('prompts', 'text') // User-defined instructions
        .addColumn('is_active', 'integer', (col) => col.defaultTo(1).notNull()) // SQLite boolean
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .execute();

    await db.schema.createIndex('uq_topics_label').on('topics').column('label').unique().execute();

    // 2. Create 'profile_topics' association table
    await db.schema
        .createTable('profile_topics')
        .addColumn('profile_id', 'text', (col) => col.notNull().references('generation_profiles.id').onDelete('cascade'))
        .addColumn('topic_id', 'text', (col) => col.notNull().references('topics.id').onDelete('cascade'))
        .addPrimaryKeyConstraint('pk_profile_topics', ['profile_id', 'topic_id'])
        .execute();

    // 3. Data Migration: Convert existing 'topic_preference' strings to Topics
    // Fetch all profiles
    const profiles = await db.selectFrom('generation_profiles')
        .select(['id', 'topic_preference'])
        .execute();

    for (const profile of profiles) {
        if (!profile.topic_preference) continue;

        // Split by comma or Chinese comma
        const topicLabels = profile.topic_preference.split(/[,，]/)
            .map((t: string) => t.trim())
            .filter((t: string) => t.length > 0);

        for (const label of topicLabels) {
            // Generate a simple ID from label (e.g., "游戏新闻" -> "you-xi-xin-wen" or hash, 
            // but for simplicity & readability, let's use a random ID or simple slug check.
            // Since we need to be robust, let's use uuid for ID and ensure label uniqueness).
            const topicId = crypto.randomUUID();

            // Try to find existing topic by label first to reuse IDs
            let existing = await db.selectFrom('topics')
                .select('id')
                .where('label', '=', label)
                .executeTakeFirst();

            let finalTopicId = existing?.id;

            if (!finalTopicId) {
                finalTopicId = topicId;
                await db.insertInto('topics')
                    .values({
                        id: finalTopicId,
                        label: label,
                        prompts: `Search and write about ${label}. focus on recent events.`, // Default prompt
                        is_active: 1
                    })
                    .execute();
            }

            // Link to profile
            await db.insertInto('profile_topics')
                .values({
                    profile_id: profile.id,
                    topic_id: finalTopicId
                })
                .onConflict((oc) => oc.doNothing())
                .execute();
        }
    }

    // 4. Seed Default Topics (If no topics exist after migration)
    const topicCount = await db.selectFrom('topics')
        .select(db.fn.count('id').as('count'))
        .executeTakeFirst();

    if (Number(topicCount?.count) === 0) {
        const defaults = [
            { label: 'General News', prompts: 'Cover significant global events and general daily news. Focus on factual reporting.' },
            { label: 'Technology', prompts: 'Focus on AI, consumer electronics, software development, and tech industry news.' },
            { label: 'Business', prompts: 'Cover markets, startups, economic trends, and major corporate announcements.' },
            { label: 'Culture', prompts: 'Focus on art, books, movies, music, and cultural phenomenons.' },
            { label: 'Science', prompts: 'Cover scientific discoveries, space exploration, health research, and environmental news.' }
        ];

        for (const t of defaults) {
            const id = t.label.toLowerCase().replace(/\s+/g, '-');
            await db.insertInto('topics')
                .values({
                    id,
                    label: t.label,
                    prompts: t.prompts,
                    is_active: 1
                })
                .execute();
        }
    }

    // 5. (Optional) We do NOT drop topic_preference column yet.
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('profile_topics').execute();
    await db.schema.dropTable('topics').execute();
}
