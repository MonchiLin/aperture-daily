/**
 * Database Model Types
 * 
 * These interfaces mirror the database schema for type-safe access
 * when using raw SQL queries that return untyped results.
 */

// Task status enum
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type TriggerSource = 'manual' | 'cron';

// Task model (from tasks table)
export interface TaskRow {
    id: string;
    type: 'article_generation';
    profile_id: string;
    profileName?: string;
    task_date: string;
    trigger_source: TriggerSource;
    status: TaskStatus;
    version: number;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    result_json: string | null;
    error_message: string | null;
    error_context_json: string | null;
    published_at: string | null;
}

// Generation profile model (from generation_profiles table)
export interface ProfileRow {
    id: string;
    name: string;
    topic_preference: string | null;
    concurrency: number;
    timeout_ms: number;
    created_at: string;
    updated_at: string;
}

// Daily words model (from daily_words table)
export interface DailyWordsRow {
    date: string;
    new_words_json: string;
    review_words_json: string;
    created_at: string;
    updated_at: string;
}

// Article model (from articles table)
export interface ArticleRow {
    id: string;
    generation_task_id: string;
    model: string;
    variant: number;
    title: string;
    content_json: string;
    status: 'draft' | 'published';
    created_at: string;
    published_at: string | null;
}

// ID-only row type for common queries
export interface IdRow {
    id: string;
}
