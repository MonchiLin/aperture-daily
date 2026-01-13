// ============ 核心领域模型 (Isomorphic) ============
import type {
    DailyNewsOutput,
    DailyNewsArticle,
    WordDefinition as ServerWordDef
} from "@server/schemas/dailyNews";

/**
 * 递归将 SnakeCase 类型转换为 CamelCase
 * 模拟后端 toCamelCase 工具函数的运行时行为
 */
export type DeepCamelCase<T> = T extends Array<infer U>
    ? Array<DeepCamelCase<U>>
    : T extends object
    ? {
        [K in keyof T as K extends string
        ? CamelCase<K>
        : K]: DeepCamelCase<T[K]>;
    }
    : T;

type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
    ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
    : Lowercase<S>;

// 前端使用的 CamelCase 类型
export type ArticleParsedContent = DeepCamelCase<{ result: DailyNewsOutput }>;
export type ArticleLevelContent = DeepCamelCase<DailyNewsArticle> & {
    sentences?: any[]; // TODO: Define sentence type from server/models if available, using any for now to unblock
};
export type WordDefinition = DeepCamelCase<ServerWordDef>;

export interface SidebarWord {
    word: string;
    phonetic: string;
    definitions: { pos: string; definition: string }[];
}

// ============ API 响应模型 ============

/**
 * 表示从 /api/articles/{id} 返回的原始行数据
 * 注意：Articles 表的字段在经过 backend processing 后已经是 camelCase，
 * 但是 contentJson 字符串 parse 出来的结构由上面的 ArticleParsedContent 定义。
 */
export interface ArticleRow {
    articles: {
        id: string;
        title: string;
        contentJson: string; // JSON string needing parsing
        readLevels: number;
        category?: string;
        createdAt?: string;
    };
    tasks?: Task;
}

export interface Task {
    id: string;
    status: string;
    taskDate: string; // ISO date string
    createdAt?: string;
    updatedAt?: string;
    profileName?: string;
}

// ============ 组件/功能模型 ============

export interface AudioSegment {
    text: string;
    isNewParagraph: boolean;
}
