import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // 1. Generation Profiles
    await db.schema
        .createTable('generation_profiles')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .execute();

    await db.schema.createIndex('uq_generation_profiles_name').ifNotExists().on('generation_profiles').column('name').unique().execute();

    // 2. Topics
    await db.schema
        .createTable('topics')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('label', 'text', (col) => col.notNull())
        .addColumn('prompts', 'text')
        .addColumn('is_active', 'integer', (col) => col.defaultTo(1).notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .execute();

    await db.schema.createIndex('uq_topics_label').ifNotExists().on('topics').column('label').unique().execute();

    // 3. Profile Topics
    await db.schema
        .createTable('profile_topics')
        .ifNotExists()
        .addColumn('profile_id', 'text', (col) => col.notNull().references('generation_profiles.id').onDelete('cascade'))
        .addColumn('topic_id', 'text', (col) => col.notNull().references('topics.id').onDelete('cascade'))
        .addPrimaryKeyConstraint('pk_profile_topics', ['profile_id', 'topic_id'])
        .execute();

    // Seed Default Topics
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
            .onConflict((oc) => oc.doNothing())
            .execute();
    }

    // 4. Tasks
    await db.schema
        .createTable('tasks')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('task_date', 'text', (col) => col.notNull())
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('trigger_source', 'text', (col) => col.defaultTo('manual').notNull())
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('llm', 'text')
        .addColumn('profile_id', 'text', (col) => col.notNull().references('generation_profiles.id'))
        .addColumn('result_json', 'text')
        .addColumn('error_message', 'text')
        .addColumn('error_context_json', 'text')
        .addColumn('version', 'integer', (col) => col.defaultTo(0).notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('started_at', 'text')
        .addColumn('finished_at', 'text')
        .addColumn('published_at', 'text')
        .addCheckConstraint('chk_tasks_type_enum', sql`type IN ('article_generation')`)
        .addCheckConstraint('chk_tasks_trigger_source_enum', sql`trigger_source IN ('manual', 'cron')`)
        .addCheckConstraint('chk_tasks_status_enum', sql`status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')`)
        .addCheckConstraint('chk_tasks_result_json_valid', sql`result_json IS NULL OR json_valid(result_json)`)
        .addCheckConstraint('chk_tasks_error_context_json_valid', sql`error_context_json IS NULL OR json_valid(error_context_json)`)
        .addCheckConstraint('chk_tasks_published_only_for_article_generation', sql`type = 'article_generation' OR published_at IS NULL`)
        .execute();

    await db.schema.createIndex('idx_tasks_task_date').ifNotExists().on('tasks').column('task_date').execute();
    await db.schema.createIndex('idx_tasks_type').ifNotExists().on('tasks').column('type').execute();
    await db.schema.createIndex('idx_tasks_status').ifNotExists().on('tasks').column('status').execute();
    await db.schema.createIndex('idx_tasks_profile_id').ifNotExists().on('tasks').column('profile_id').execute();
    await db.schema.createIndex('idx_tasks_published_at').ifNotExists().on('tasks').column('published_at').execute();

    // 5. Daily Word References
    await db.schema
        .createTable('daily_word_references')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('date', 'text', (col) => col.notNull())
        .addColumn('word', 'text', (col) => col.notNull())
        .addColumn('type', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addCheckConstraint('chk_daily_word_references_type', sql`type IN ('new', 'review')`)
        .execute();

    await db.schema.createIndex('idx_daily_word_references_date').ifNotExists().on('daily_word_references').column('date').execute();
    await db.schema.createIndex('idx_daily_word_references_word').ifNotExists().on('daily_word_references').column('word').execute();

    // 6. Words
    await db.schema
        .createTable('words')
        .ifNotExists()
        .addColumn('word', 'text', (col) => col.primaryKey().notNull())
        .addColumn('mastery_status', 'text', (col) => col.defaultTo('unknown').notNull())
        .addColumn('origin', 'text', (col) => col.notNull())
        .addColumn('origin_ref', 'text')
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('updated_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addCheckConstraint('chk_words_mastery_status_enum', sql`mastery_status IN ('unknown', 'familiar', 'mastered')`)
        .addCheckConstraint('chk_words_origin_enum', sql`origin IN ('shanbay', 'article', 'manual')`)
        .execute();

    await db.schema.createIndex('idx_words_mastery_status').ifNotExists().on('words').column('mastery_status').execute();
    await db.schema.createIndex('idx_words_origin').ifNotExists().on('words').column('origin').execute();

    // 7. Articles
    await db.schema
        .createTable('articles')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('generation_task_id', 'text', (col) => col.notNull().references('tasks.id'))
        .addColumn('model', 'text', (col) => col.notNull())
        .addColumn('variant', 'integer', (col) => col.notNull())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('slug', 'text')
        .addColumn('source_url', 'text')
        .addColumn('status', 'text', (col) => col.notNull())
        .addColumn('category', 'text')
        .addColumn('read_levels', 'integer', (col) => col.defaultTo(0))
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addColumn('published_at', 'text')
        .addCheckConstraint('chk_articles_status_enum', sql`status IN ('draft', 'published')`)
        .addCheckConstraint('chk_articles_variant_gte1', sql`variant >= 1`)
        .execute();

    await db.schema.createIndex('uq_articles_unique').ifNotExists().on('articles').columns(['generation_task_id', 'model', 'variant']).unique().execute();
    await db.schema.createIndex('uq_articles_slug').ifNotExists().on('articles').column('slug').unique().execute();
    await db.schema.createIndex('idx_articles_generation_task_id').ifNotExists().on('articles').column('generation_task_id').execute();
    await db.schema.createIndex('idx_articles_status').ifNotExists().on('articles').column('status').execute();
    await db.schema.createIndex('idx_articles_published').ifNotExists().on('articles').column('published_at').execute();
    await db.schema.createIndex('idx_articles_category').ifNotExists().on('articles').column('category').execute();

    // 8. Article Variants
    await db.schema
        .createTable('article_variants')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('article_id', 'text', (col) => col.notNull().references('articles.id'))
        .addColumn('level', 'integer', (col) => col.notNull())
        .addColumn('level_label', 'text', (col) => col.notNull())
        .addColumn('title', 'text', (col) => col.notNull())
        .addColumn('content', 'text', (col) => col.notNull())
        .addColumn('syntax_json', 'text')
        .addColumn('sentences_json', 'text')
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .addCheckConstraint('chk_article_variants_syntax_json_valid', sql`syntax_json IS NULL OR json_valid(syntax_json)`)
        .addCheckConstraint('chk_article_variants_sentences_json_valid', sql`sentences_json IS NULL OR json_valid(sentences_json)`)
        .execute();

    await db.schema.createIndex('idx_article_variants_article_id').ifNotExists().on('article_variants').column('article_id').execute();
    await db.schema.createIndex('idx_article_variants_level').ifNotExists().on('article_variants').columns(['article_id', 'level']).unique().execute();

    // 9. Article Vocabulary
    await db.schema
        .createTable('article_vocabulary')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('article_id', 'text', (col) => col.notNull().references('articles.id'))
        .addColumn('word', 'text', (col) => col.notNull())
        .addColumn('used_form', 'text')
        .addColumn('phonetic', 'text')
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .execute();

    await db.schema.createIndex('idx_article_vocabulary_article_word').ifNotExists().on('article_vocabulary').columns(['article_id', 'word']).unique().execute();

    // 10. Article Vocab Definitions
    await db.schema
        .createTable('article_vocab_definitions')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('vocab_id', 'text', (col) => col.notNull().references('article_vocabulary.id'))
        .addColumn('part_of_speech', 'text', (col) => col.notNull())
        .addColumn('definition', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .execute();

    await db.schema.createIndex('idx_article_vocab_definitions_vocab_id').ifNotExists().on('article_vocab_definitions').column('vocab_id').execute();

    // 11. Article Word Index
    await db.schema
        .createTable('article_word_index')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey().notNull())
        .addColumn('word', 'text', (col) => col.notNull())
        .addColumn('article_id', 'text', (col) => col.notNull().references('articles.id'))
        .addColumn('context_snippet', 'text', (col) => col.notNull())
        .addColumn('role', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
        .execute();

    await db.schema.createIndex('idx_article_word_index_word').ifNotExists().on('article_word_index').column('word').execute();
    await db.schema.createIndex('idx_article_word_index_article_id').ifNotExists().on('article_word_index').column('article_id').execute();

    // 12. Highlights
    await db.schema
        .createTable('highlights')
        .ifNotExists()
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

    await db.schema.createIndex('idx_highlights_article_id').ifNotExists().on('highlights').column('article_id').execute();
    await db.schema.createIndex('idx_highlights_actor').ifNotExists().on('highlights').column('actor').execute();
    await db.schema.createIndex('idx_highlights_article_actor').ifNotExists().on('highlights').columns(['article_id', 'actor']).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('highlights').ifExists().execute();
    await db.schema.dropTable('article_word_index').ifExists().execute();
    await db.schema.dropTable('article_vocab_definitions').ifExists().execute();
    await db.schema.dropTable('article_vocabulary').ifExists().execute();
    await db.schema.dropTable('article_variants').ifExists().execute();
    await db.schema.dropTable('articles').ifExists().execute();
    await db.schema.dropTable('words').ifExists().execute();
    await db.schema.dropTable('daily_word_references').ifExists().execute();
    await db.schema.dropTable('tasks').ifExists().execute();
    await db.schema.dropTable('profile_topics').ifExists().execute();
    await db.schema.dropTable('topics').ifExists().execute();
    await db.schema.dropTable('generation_profiles').ifExists().execute();
}
