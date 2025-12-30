export const API_BASE = import.meta.env.PUBLIC_API_BASE;

type FetchOptions = RequestInit & {
    token?: string | null; // For x-admin-key
};

/**
 * Unified fetch wrapper for backend API calls.
 * Automatically prepends API_BASE and handles x-admin-key header.
 * Parses JSON response automatically and throws error on non-2xx status.
 */
export async function apiFetch<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
    const { token, ...init } = options;

    // Clean up path to ensure exactly one slash between base and path
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = path.startsWith('http') ? path : `${API_BASE}${cleanPath}`;

    const headers = new Headers(init.headers);
    if (token) {
        headers.set('x-admin-key', token);
    }

    const res = await fetch(url, { ...init, headers });

    // Handle empty responses (like 204 No Content)
    const text = await res.text();
    let data: any = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        // If valid JSON parsing fails but response is OK, strictly we might want to return text?
        // But for our API everything is JSON. Let's assume error if strict JSON fails unless empty.
        console.warn('Failed to parse JSON response', e);
    }

    if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
    }

    return data as T;
}
