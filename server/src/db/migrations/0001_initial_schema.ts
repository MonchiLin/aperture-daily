import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // Generation Profiles
    await db.schema
        .createTable('generation_profiles')
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('topic_preference', 'text', (col) => col.notNull())
        .addColumn('concurrency', 'integer', (col) => col.notNull())
        .addColumn('timeout_ms', 'integer', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addCheckConstraint('chk_generation_profiles_concurrency_gt0', sql`concurrency > 0`)
        .addCheckConstraint('chk_generation_profiles_timeout_ms_gt0', sql`timeout_ms > 0`)
        .execute();

    await db.schema.createIndex('uq_generation_profiles_name').on('generation_profiles').column('name').unique().execute();
    await db.schema.createIndex('idx_generation_profiles_topic_preference').on('generation_profiles').column('topic_preference').execute();

    // Tasks
    await db.schema
        .createTable('tasks')
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('task_date', 'text', (col) => col.notNull())
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('trigger_source', 'text', (col) => col.defaultTo('manual').notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('profile_id', 'text', (col) => col.notNull().references('generation_profiles.id'))
        .addColumn('result_json', 'text')
        .addColumn('error_message', 'text')
        .addColumn('error_context_json', 'text')
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('started_at', 'text')
        .addColumn('finished_at', 'text')
        .addColumn('published_at', 'text')
        .addColumn('version', 'integer', (col) => col.defaultTo(0).notNull())
        .addCheckConstraint('chk_tasks_type_enum', sql`type IN ('article_generation')`)
        .addCheckConstraint('chk_tasks_trigger_source_enum', sql`trigger_source IN ('manual', 'cron')`)
        .addCheckConstraint('chk_tasks_status_enum', sql`status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')`)
        .addCheckConstraint('chk_tasks_result_json_valid', sql`result_json IS NULL OR json_valid(result_json)`)
        .addCheckConstraint('chk_tasks_error_context_json_valid', sql`error_context_json IS NULL OR json_valid(error_context_json)`)
        .addCheckConstraint('chk_tasks_published_only_for_article_generation', sql`type = 'article_generation' OR published_at IS NULL`)
        .execute();

    await db.schema.createIndex('idx_tasks_task_date').on('tasks').column('task_date').execute();
    await db.schema.createIndex('idx_tasks_type').on('tasks').column('type').execute();
    await db.schema.createIndex('idx_tasks_status').on('tasks').column('status').execute();
    await db.schema.createIndex('idx_tasks_profile_id').on('tasks').column('profile_id').execute();
    await db.schema.createIndex('idx_tasks_published_at').on('tasks').column('published_at').execute();

    // Daily Words
    await db.schema
        .createTable('daily_words')
        .addColumn('date', 'text', (col) => col.primaryKey().notNull())
        .addColumn('new_words_json', 'text', (col) => col.notNull())
        .addColumn('review_words_json', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addCheckConstraint('chk_daily_words_new_words_json_valid', sql`json_valid(new_words_json)`)
        .addCheckConstraint('chk_daily_words_review_words_json_valid', sql`json_valid(review_words_json)`)
        .execute();

    // Words
    await db.schema
        .createTable('words')
        .addColumn('word', 'text', (col) => col.primaryKey().notNull())
        .addColumn('mastery_status', 'text', (col) => col.defaultTo('unknown').notNull())
        .addColumn('origin', 'text', (col) => col.notNull())
        .addColumn('origin_ref', 'text')
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addCheckConstraint('chk_words_mastery_status_enum', sql`mastery_status IN ('unknown', 'familiar', 'mastered')`)
        .addCheckConstraint('chk_words_origin_enum', sql`origin IN ('shanbay', 'article', 'manual')`)
        .execute();

    await db.schema.createIndex('idx_words_mastery_status').on('words').column('mastery_status').execute();
    await db.schema.createIndex('idx_words_origin').on('words').column('origin').execute();

    // Word Learning Records
    await db.schema
        .createTable('word_learning_records')
        .addColumn('word', 'text', (col) => col.primaryKey().notNull().references('words.word'))
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('last_shanbay_sync_date', 'text')
        .addColumn('due_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('stability', 'real', (col) => col.defaultTo(0).notNull())
        .addColumn('difficulty', 'real', (col) => col.defaultTo(0).notNull())
        .addColumn('elapsed_days', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('scheduled_days', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('learning_steps', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('reps', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('lapses', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('state', 'text', (col) => col.defaultTo('new').notNull())
        .addColumn('last_review_at', 'text')
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addCheckConstraint('chk_word_learning_records_state_enum', sql`state IN ('new', 'learning', 'review', 'relearning')`)
        .addCheckConstraint('chk_word_learning_records_elapsed_days_gte0', sql`elapsed_days >= 0`)
        .addCheckConstraint('chk_word_learning_records_scheduled_days_gte0', sql`scheduled_days >= 0`)
        .addCheckConstraint('chk_word_learning_records_learning_steps_gte0', sql`learning_steps >= 0`)
        .addCheckConstraint('chk_word_learning_records_reps_gte0', sql`reps >= 0`)
        .addCheckConstraint('chk_word_learning_records_lapses_gte0', sql`lapses >= 0`)
        .execute();

    await db.schema.createIndex('idx_word_learning_records_due_at').on('word_learning_records').column('due_at').execute();

    // Articles
    await db.schema
        .createTable('articles')
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('generation_task_id', 'text', (col) => col.notNull().references('tasks.id'))
        .addColumn('model', 'text', (col) => col.notNull())
        .addColumn('variant', 'integer', (col) => col.notNull())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('content_json', 'text', (col) => col.notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('published_at', 'text')
        // Additional columns implicitly in schema.sql but explicitly used in types?
        // Looking at schema.sql line 84-85: source_url, slug, read_levels are NOT in the CREATE TABLE output I saw earlier?
        // Wait, let me re-check schema.sql content I read in Step 25.
        // Lines 84-85 of schema.sql were REMOVED in the file view?
        // Re-reading Step 25 Output...
        // Ah, Step 25 output lines 106-121:
        // 106: CREATE TABLE articles (
        // 107: 	id text PRIMARY KEY NOT NULL,
        // 108: 	generation_task_id text NOT NULL,
        // 109: 
        // 110: 	model text NOT NULL,
        // 111: 	variant integer NOT NULL,
        // 112: 	title text NOT NULL,
        // 113: 	content_json text NOT NULL,
        // 114: 	status text NOT NULL,
        // 115: 	created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
        // 116: 	published_at text,
        // ...
        // BUT src/db/types.ts has:
        // 84:     source_url: string | null;
        // 85:     slug: string | null;
        // 88:     read_levels: Generated<number>; // Default 0
        //
        // This implies schema.sql vs types.ts mismatch, OR I missed something.
        // Wait, looking at lines 77-92 of types.ts vs lines 106-121 schema.sql.
        // schema.sql DOES NOT have source_url, slug.
        // USER said "1.0.1 修改了数据库字段", implying checking migration process.
        // I should strictly follow schema.sql as the SOURCE OF TRUTH for the initial migration.
        // If types.ts has extra fields, they might be planned or leftovers.
        // I will follow schema.sql exactly from Step 25.

        .addCheckConstraint('chk_articles_status_enum', sql`status IN ('draft', 'published')`)
        .addCheckConstraint('chk_articles_variant_gte1', sql`variant >= 1`)
        .addCheckConstraint('chk_articles_content_json_valid', sql`json_valid(content_json)`)
        .execute();

    // Notes: types.ts seems to define ArticleVariantsTable etc which are NOT in schema.sql?
    // Re-reading Step 25 schema.sql...
    // I see `daily_words`, `words`, `word_learning_records`, `articles`, `highlights`, `tasks`, `generation_profiles`.
    // I DO NOT see `article_variants`, `article_vocabulary`, `article_vocab_definitions`, `article_word_index` in schema.sql!!!
    // This is a major discrepancy. `types.ts` has them. `schema.sql` does not.
    // The user previously said "Explore server/db for schema definitions" (Step 15).
    // It seems `server/db/schema.sql` might be OUTDATED or INCOMPLETE compared to `types.ts`?
    // OR `types.ts` defines things that are stored in JSON columns?
    // e.g. `article_variants` table in types.ts lines 94-107.
    // In schema.sql, `articles` has `content_json`. Maybe variants are inside?
    // BUT types.ts has `ArticleVariantsTable` interface.
    // Wait, if I look at `server/src/db/types.ts` line 9-14:
    // article_variants: ArticleVariantsTable;
    // article_vocabulary: ArticleVocabularyTable;
    // ...
    // This suggests they SHOULD be tables.
    // But `schema.sql` clearly lacks them.
    // Let me convert exactly what is in `schema.sql` for now as "Initial Schema".
    // A future migration can add the missing tables if they are actually needed.
    // Or `schema.sql` is just wrong.
    // However, since the user is moving FROM `schema.sql` based workflow, I must honor `schema.sql`.

    await db.schema.createIndex('uq_articles_unique').on('articles').columns(['generation_task_id', 'model', 'variant']).unique().execute();
    await db.schema.createIndex('idx_articles_generation_task_id').on('articles').column('generation_task_id').execute();
    await db.schema.createIndex('idx_articles_status').on('articles').column('status').execute();
    await db.schema.createIndex('idx_articles_published').on('articles').column('published_at').execute();

    // Highlights
    await db.schema
        .createTable('highlights')
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('article_id', 'text', (col) => col.notNull().references('articles.id'))
        .addColumn('actor', 'text', (col) => col.notNull())
        .addColumn('start_meta_json', 'text', (col) => col.notNull())
        .addColumn('end_meta_json', 'text', (col) => col.notNull())
        .addColumn('text', 'text', (col) => col.notNull())
        .addColumn('note', 'text')
        .addColumn('style_json', 'text')
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('deleted_at', 'text')
        .addCheckConstraint('chk_highlights_start_meta_json_valid', sql`json_valid(start_meta_json)`)
        .addCheckConstraint('chk_highlights_end_meta_json_valid', sql`json_valid(end_meta_json)`)
        .addCheckConstraint('chk_highlights_style_json_valid', sql`style_json IS NULL OR json_valid(style_json)`)
        .execute();

    await db.schema.createIndex('idx_highlights_article_id').on('highlights').column('article_id').execute();
    await db.schema.createIndex('idx_highlights_actor').on('highlights').column('actor').execute();
    await db.schema.createIndex('idx_highlights_article_actor').on('highlights').columns(['article_id', 'actor']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('highlights').execute();
    await db.schema.dropTable('articles').execute();
    await db.schema.dropTable('word_learning_records').execute();
    await db.schema.dropTable('words').execute();
    await db.schema.dropTable('daily_words').execute();
    await db.schema.dropTable('tasks').execute();
    await db.schema.dropTable('generation_profiles').execute();
}
