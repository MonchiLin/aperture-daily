/**
 * 数据库模型类型
 * 
 * 当使用原生 SQL 查询返回非类型化结果时，
 * 这些接口映射了数据库 schema 以提供类型安全访问。
 */

// 任务状态枚举
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type TriggerSource = 'manual' | 'cron';

// 任务模型 (来自 tasks 表)
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
    llm?: string | null; // 选用的 Provider (gemini, openai, claude)
}

// 生成配置模型 (来自 generation_profiles 表)
export interface ProfileRow {
    id: string;
    name: string;
    topic_preference: string | null;
    concurrency: number;
    timeout_ms: number;
    created_at: string;
    updated_at: string;
}

// 每日单词模型 (来自 daily_words 表)
export interface DailyWordsRow {
    date: string;
    new_words_json: string;
    review_words_json: string;
    created_at: string;
    updated_at: string;
}

// 文章模型 (来自 articles 表)
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

// 仅包含 ID 的行类型，用于通用查询
export interface IdRow {
    id: string;
}
