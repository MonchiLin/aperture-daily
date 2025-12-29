export type TaskRow = {
    id: string;
    task_date: string;
    type: string;
    trigger_source: string;
    status: string;
    profile_id: string;
    profileName?: string;
    result_json: string | null;
    error_message: string | null;
    error_context_json: string | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
    published_at: string | null;
};

import { API_BASE } from '../../lib/api';

export async function fetchJson<T = unknown>(url: string, adminKey: string, init?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    const resp = await fetch(fullUrl, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            'x-admin-key': adminKey
        }
    });
    const text = await resp.text();
    const data = text ? JSON.parse(text) : null;
    if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
    return data as T;
}

export function formatTime(iso: string | null | undefined): string {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false // 24-hour format
        });
    } catch {
        return iso;
    }
}
