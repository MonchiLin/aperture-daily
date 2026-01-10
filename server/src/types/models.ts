/**
 * 数据库模型类型 (Kysely Linked)
 * 
 * Update: Now derived from strict Kysely types.
 */

import type { Selectable } from 'kysely';
import type {
    TasksTable,
    GenerationProfilesTable,
    ArticlesTable,
    DailyWordReferencesTable
} from '../db/types';

export type TaskStatus = TasksTable['status'];
export type TriggerSource = 'manual' | 'cron'; // Can extract from generic if needed

export type TaskRow = Selectable<TasksTable> & {
    profileName?: string;
    // Compatibility: Accessing JSON columns will now return Objects, not strings.
};

export type ProfileRow = Selectable<GenerationProfilesTable>;

// DailyWordReferences replaces the old DailyWordsRow logic which seemed to assume JSON blobs
export type DailyWordReferenceRow = Selectable<DailyWordReferencesTable>;

export type ArticleRow = Selectable<ArticlesTable>;

export interface IdRow {
    id: string;
}
