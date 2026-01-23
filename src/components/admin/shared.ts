export type TaskRow = {
    id: string;
    task_date: string;
    type: string;
    trigger_source: string;
    status: string;
    profile_id: string;
    profileName?: string;
    mode: 'rss' | 'impression';
    context_json: string | null; // Checkpoints
    // result_json: string | null; // Removed
    error_message: string | null;
    error_context_json: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    published_at: string | null;
};

import { apiFetch } from '../../lib/api';

/**
 * API 调用（使用 Cookie 鉴权）
 */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
    return apiFetch<T>(url, init);
}


