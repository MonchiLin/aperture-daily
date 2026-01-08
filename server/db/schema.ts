import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const generationProfiles = sqliteTable(
    'generation_profiles',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        topicPreference: text('topic_preference').notNull(),
        concurrency: integer('concurrency').notNull(),
        timeoutMs: integer('timeout_ms').notNull(),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: text('updated_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`)
    },
    (table) => [
        uniqueIndex('uq_generation_profiles_name').on(table.name),
        index('idx_generation_profiles_topic_preference').on(table.topicPreference),
        check('chk_generation_profiles_concurrency_gt0', sql`${table.concurrency} > 0`),
        check('chk_generation_profiles_timeout_ms_gt0', sql`${table.timeoutMs} > 0`)
    ]
);

// 每个 profile 的每日任务状态（queued/running/succeeded/failed/canceled）。
export const tasks = sqliteTable(
    'tasks',
    {
        id: text('id').primaryKey(),
        taskDate: text('task_date').notNull(), // 业务日期：YYYY-MM-DD（Asia/Shanghai）
        type: text('type', { enum: ['article_generation'] }).notNull(),
        triggerSource: text('trigger_source', { enum: ['manual', 'cron'] })
            .notNull()
            .default('manual'),
        status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed', 'canceled'] }).notNull(),
        profileId: text('profile_id')
            .notNull()
            .references(() => generationProfiles.id),
        resultJson: text('result_json'),
        errorMessage: text('error_message'),
        errorContextJson: text('error_context_json'),
        version: integer('version').notNull().default(0), // For optimistic locking
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        startedAt: text('started_at'),
        finishedAt: text('finished_at'),
        publishedAt: text('published_at')
    },
    (table) => [
        index('idx_tasks_task_date').on(table.taskDate),
        index('idx_tasks_type').on(table.type),
        index('idx_tasks_status').on(table.status),
        index('idx_tasks_profile_id').on(table.profileId),
        index('idx_tasks_published_at').on(table.publishedAt),
        check('chk_tasks_type_enum', sql`${table.type} IN ('article_generation')`),
        check('chk_tasks_trigger_source_enum', sql`${table.triggerSource} IN ('manual', 'cron')`),
        check('chk_tasks_status_enum', sql`${table.status} IN ('queued', 'running', 'succeeded', 'failed', 'canceled')`),
        check('chk_tasks_result_json_valid', sql`${table.resultJson} IS NULL OR json_valid(${table.resultJson})`),
        check(
            'chk_tasks_error_context_json_valid',
            sql`${table.errorContextJson} IS NULL OR json_valid(${table.errorContextJson})`
        ),
        check('chk_tasks_published_only_for_article_generation', sql`${table.type} = 'article_generation' OR ${table.publishedAt} IS NULL`)
    ]
);

export const dailyWordReferences = sqliteTable(
    'daily_word_references',
    {
        id: text('id').primaryKey(),
        date: text('date').notNull(),
        word: text('word')
            .notNull()
            .references(() => words.word, { onDelete: 'cascade' }),
        type: text('type', { enum: ['new', 'review'] }).notNull(),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
    },
    (table) => [
        uniqueIndex('uq_daily_word_ref').on(table.date, table.word),
        index('idx_daily_word_ref_date').on(table.date),
        index('idx_daily_word_ref_word').on(table.word),
        check('chk_daily_word_ref_type_enum', sql`${table.type} IN ('new', 'review')`)
    ]
);

export const words = sqliteTable(
    'words',
    {
        word: text('word').primaryKey(),
        masteryStatus: text('mastery_status').notNull().default('unknown'),
        origin: text('origin', { enum: ['shanbay', 'article', 'manual'] }).notNull(),
        originRef: text('origin_ref'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: text('updated_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`)
    },
    (table) => [
        index('idx_words_origin').on(table.origin),
        check('chk_words_origin_enum', sql`${table.origin} IN ('shanbay', 'article', 'manual')`)
    ]
);

// Add read_levels column dynamically via migration or assume new deploy. 
// Ideally we run a migration. For now, we add it to schema.
// Since Drizzle Kit push handles schema changes for SQLite (D1ish/Local), 
// we just add the field.
// ... (existing code)

export const articles = sqliteTable(
    'articles',
    {
        id: text('id').primaryKey(),
        generationTaskId: text('generation_task_id')
            .notNull()
            .references(() => tasks.id, { onDelete: 'cascade' }),

        model: text('model').notNull(),
        variant: integer('variant').notNull(),
        title: text('title').notNull(),

        // [New] Normalized columns
        sourceUrl: text('source_url'), // Single source URL
        slug: text('slug'), // [New] for clean URLs (e.g. "my-article-title")

        status: text('status', { enum: ['draft', 'published'] }).notNull(),
        readLevels: integer('read_levels').notNull().default(0),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        publishedAt: text('published_at')
    },
    (table) => [
        uniqueIndex('uq_articles_unique').on(table.generationTaskId, table.model),
        index('idx_articles_generation_task_id').on(table.generationTaskId),
        index('idx_articles_status').on(table.status),
        index('idx_articles_published').on(table.publishedAt),
        check('chk_articles_status_enum', sql`${table.status} IN ('draft', 'published')`)
    ]
);

// [New] Stores the actual content for each difficulty level
export const articleVariants = sqliteTable(
    'article_variants',
    {
        id: text('id').primaryKey(),
        articleId: text('article_id')
            .notNull()
            .references(() => articles.id, { onDelete: 'cascade' }),
        level: integer('level').notNull(), // 1, 2, 3
        levelLabel: text('level_label').notNull(), // e.g. "B1 Intermediate"
        title: text('title').notNull(),
        content: text('content').notNull(), // Markdown Content
        syntaxJson: text('syntax_json'), // Sentence structure analysis
        sentencesJson: text('sentences_json'), // Sentence boundaries [{id, start, end, text}]
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
    },
    (table) => [
        uniqueIndex('uq_article_variant_level').on(table.articleId, table.level),
        index('idx_article_variant_article_id').on(table.articleId)
    ]
);

// [New] Stores the unique words for the article (Parent Table)
export const articleVocabulary = sqliteTable(
    'article_vocabulary',
    {
        id: text('id').primaryKey(),
        articleId: text('article_id')
            .notNull()
            .references(() => articles.id, { onDelete: 'cascade' }),
        word: text('word').notNull(),
        usedForm: text('used_form'),
        phonetic: text('phonetic'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
    },
    (table) => [
        uniqueIndex('uq_article_vocab_word').on(table.articleId, table.word),
        index('idx_article_vocab_article_id').on(table.articleId)
    ]
);

// [New] Stores the specific meanings (Child Table)
export const articleVocabDefinitions = sqliteTable(
    'article_vocab_definitions',
    {
        id: text('id').primaryKey(),
        vocabId: text('vocab_id')
            .notNull()
            .references(() => articleVocabulary.id, { onDelete: 'cascade' }),
        partOfSpeech: text('part_of_speech').notNull(), // e.g. "n.", "v."
        definition: text('definition').notNull(),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
    },
    (table) => [
        index('idx_vocab_def_vocab_id').on(table.vocabId),
        index('idx_vocab_def_pos').on(table.partOfSpeech)
    ]
);

// ... (existing highlights, articleWordIndex)

// web-highlighter 选区与笔记；通过 deleted_at 软删。
export const highlights = sqliteTable(
    'highlights',
    {
        id: text('id').primaryKey(),
        articleId: text('article_id')
            .notNull()
            .references(() => articles.id, { onDelete: 'cascade' }),
        actor: text('actor').notNull(),
        startMetaJson: text('start_meta_json').notNull(),
        endMetaJson: text('end_meta_json').notNull(),
        text: text('text').notNull(),
        note: text('note'),
        styleJson: text('style_json'),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: text('updated_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`),
        deletedAt: text('deleted_at')
    },
    (table) => [
        index('idx_highlights_article_id').on(table.articleId),
        index('idx_highlights_actor').on(table.actor),
        index('idx_highlights_article_actor').on(table.articleId, table.actor),
        check('chk_highlights_start_meta_json_valid', sql`json_valid(${table.startMetaJson})`),
        check('chk_highlights_end_meta_json_valid', sql`json_valid(${table.endMetaJson})`),
        check('chk_highlights_style_json_valid', sql`${table.styleJson} IS NULL OR json_valid(${table.styleJson})`)
    ]
);

export const articleWordIndex = sqliteTable(
    'article_word_index',
    {
        id: text('id').primaryKey(),
        word: text('word').notNull(),
        articleId: text('article_id')
            .notNull()
            .references(() => articles.id, { onDelete: 'cascade' }),
        contextSnippet: text('context_snippet').notNull(),
        role: text('role', { enum: ['keyword', 'entity'] }).notNull(),
        createdAt: text('created_at')
            .notNull()
            .default(sql`(CURRENT_TIMESTAMP)`)
    },
    (table) => [
        index('idx_awi_word').on(table.word),
        index('idx_awi_article_id').on(table.articleId),
        uniqueIndex('uq_awi_word_article').on(table.word, table.articleId),
        check('chk_awi_role_enum', sql`${table.role} IN ('keyword', 'entity')`)
    ]
);
