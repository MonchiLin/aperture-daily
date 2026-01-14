import type { Generated, JSONColumnType } from 'kysely';

export interface Database {
    generation_profiles: GenerationProfilesTable;
    tasks: TasksTable;
    daily_word_references: DailyWordReferencesTable;
    words: WordsTable;
    articles: ArticlesTable;
    article_variants: ArticleVariantsTable;
    article_vocabulary: ArticleVocabularyTable;
    article_vocab_definitions: ArticleVocabDefinitionsTable;
    highlights: HighlightsTable;
    article_word_index: ArticleWordIndexTable;
    topics: TopicsTable;
    profile_topics: ProfileTopicsTable;
    news_sources: NewsSourcesTable;
    topic_sources: TopicSourcesTable;
    profile_sources: ProfileSourcesTable;
}

// =========================================
// Generation Profiles
// =========================================
export interface GenerationProfilesTable {
    id: string; // UUID
    name: string;
    created_at: Generated<string>;
    updated_at: Generated<string>;
}

// =========================================
// Tasks (Orchestration)
// =========================================
export interface TasksTable {
    id: string; // UUID
    task_date: string; // YYYY-MM-DD
    type: 'article_generation';
    trigger_source: Generated<'manual' | 'cron'>;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
    llm: 'gemini' | 'openai' | 'claude' | null;
    profile_id: string;

    // JSON Columns - Using generic types for now, can be refined later
    result_json: JSONColumnType<any> | null;
    error_message: string | null;
    error_context_json: JSONColumnType<any> | null;

    version: Generated<number>; // Default 0

    created_at: Generated<string>;
    started_at: string | null;
    finished_at: string | null;
    published_at: string | null;
}

// =========================================
// Word References (Knowledge Graph)
// =========================================
export interface DailyWordReferencesTable {
    id: string;
    date: string;
    word: string;
    type: 'new' | 'review';
    created_at: Generated<string>;
}

export interface WordsTable {
    word: string;
    mastery_status: Generated<string>; // default 'unknown'
    origin: 'shanbay' | 'article' | 'manual';
    origin_ref: string | null;
    created_at: Generated<string>;
    updated_at: Generated<string>;
}

// =========================================
// Articles (Content CMS)
// =========================================
export interface ArticlesTable {
    id: string;
    generation_task_id: string;
    model: string;
    variant: number;
    title: string;
    category: string | null;

    source_url: string | null;
    slug: string | null;

    // RSS 来源追踪
    rss_source_id: string | null;  // 关联 news_sources.id
    rss_link: string | null;       // RSS 文章原始链接

    status: 'draft' | 'published';
    read_levels: Generated<number>; // Default 0

    created_at: Generated<string>;
    published_at: string | null;
}

export interface ArticleVariantsTable {
    id: string;
    article_id: string;
    level: number;
    level_label: string;
    title: string;
    content: string; // Markdown

    // JSON Columns
    syntax_json: JSONColumnType<any> | null;
    sentences_json: JSONColumnType<any> | null;

    created_at: Generated<string>;
}

export interface ArticleVocabularyTable {
    id: string;
    article_id: string;
    word: string;
    used_form: string | null;
    phonetic: string | null;
    created_at: Generated<string>;
}

export interface ArticleVocabDefinitionsTable {
    id: string;
    vocab_id: string;
    part_of_speech: string;
    definition: string;
    created_at: Generated<string>;
}

// =========================================
// User Data
// =========================================
export interface HighlightsTable {
    id: string;
    article_id: string;
    actor: string;

    start_meta_json: JSONColumnType<any>;
    end_meta_json: JSONColumnType<any>;

    text: string;
    note: string | null;
    style_json: JSONColumnType<any> | null;

    created_at: Generated<string>;
    updated_at: Generated<string>;
    deleted_at: string | null;
}

export interface ArticleWordIndexTable {
    id: string;
    word: string;
    article_id: string;
    context_snippet: string;
    role: 'keyword' | 'entity';
    created_at: Generated<string>;
}

// =========================================
// Topics System
// =========================================
export interface TopicsTable {
    id: string;
    label: string;
    prompts: string | null;
    is_active: Generated<number>; // 0 or 1
    created_at: Generated<string>;
    updated_at: Generated<string>;
}

export interface ProfileTopicsTable {
    profile_id: string;
    topic_id: string;
}

// =========================================
// News Sources (RSS)
// =========================================
export interface NewsSourcesTable {
    id: string; // UUID
    name: string;
    url: string;
    is_active: Generated<number>; // 0 or 1
    created_at: Generated<string>;
    updated_at: Generated<string>;
}

export interface TopicSourcesTable {
    topic_id: string;
    source_id: string;
}

export interface ProfileSourcesTable {
    profile_id: string;
    source_id: string;
}
