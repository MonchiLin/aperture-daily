// ============ Core Domain Models ============

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

// ============ API Response Models ============

/**
 * Represents the structure of the JSON content stored in the DB
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
 * Represents the raw row returned from /api/articles/{id}
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

// ============ Component/Feature Models ============

export interface AudioSegment {
    text: string;
    isNewParagraph: boolean;
}
