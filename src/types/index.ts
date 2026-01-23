/**
 * 统一类型定义
 * 
 * 集中管理前端共享的类型，避免重复定义
 */

// ============ Article Types ============

export interface Article {
    id: string;
    model: string;
    title: string;
    read_levels?: number;
    generation_mode?: 'rss' | 'impression';
}

export interface ArticlesState {
    date: string;
    articles: Article[];
    loading: boolean;
}

// ============ Word Types ============

export interface WordData {
    new_words: string[];
    review_words: string[];
    new_count: number;
    review_count: number;
}

export interface WordDefinition {
    word: string;
    used_form?: string;
    definition?: string;
    translation?: string;
    pos?: string;
}

// ============ Admin Types ============

export interface AdminData {
    isAdmin: boolean;
    tasks: Task[];
}

export interface Task {
    id: string;
    status: string;
    task_date: string;
    created_at?: string;
    updated_at?: string;
}
