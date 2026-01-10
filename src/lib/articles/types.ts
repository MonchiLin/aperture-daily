// ============ 核心领域模型 ============

export interface WordDefinition {
    word: string;
    used_form?: string;
    phonetic?: string;
    definitions: { pos: string; definition: string }[];
}

export interface SidebarWord {
    word: string;
    phonetic: string;
    definitions: { pos: string; definition: string }[];
}

// ============ API 响应模型 ============

/**
 * 表示存储在数据库中的 JSON 内容结构
 */
export interface ArticleParsedContent {
    result?: {
        sources?: string[];
        word_definitions?: WordDefinition[];
        articles?: Array<ArticleLevelContent>;
    };
}

export interface ArticleLevelContent {
    level: 1 | 2 | 3;
    level_name: string;
    content: string;
    title?: string;
    difficulty_desc: string;
    syntax?: Array<{
        start: number;
        end: number;
        role: string;
        text?: string;
    }>;
    sentences?: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
    }>;
}

/**
 * 表示从 /api/articles/{id} 返回的原始行数据
 */
export interface ArticleRow {
    articles: {
        id: string;
        title: string;
        content_json: string; // JSON string needing parsing
        read_levels: number;
        created_at?: string;
    };
    tasks?: Task;
}

export interface Task {
    id: string;
    status: string;
    task_date: string; // ISO date string
    created_at?: string;
    updated_at?: string;
    profileName?: string;
}

// ============ 组件/功能模型 ============

export interface AudioSegment {
    text: string;
    isNewParagraph: boolean;
}
