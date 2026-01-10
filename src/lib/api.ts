export const API_BASE = import.meta.env.PUBLIC_API_BASE;

type FetchOptions = RequestInit & {
    token?: string | null; // For x-admin-key header
    credentials?: RequestCredentials; // For cookie auth
};

/**
 * 统一的 API 客户端 (Fetch Wrapper)
 * 
 * 设计意图：
 * 1. 路径规范化：自动处理 base path (`/api`)，防止手动拼接出错。
 * 2. 鉴权注入 (Middleware-like)：自动将 token 注入 `x-admin-key` 头。
 * 3. 响应解析流水线：
 *    - 自动识别 Content-Type json。
 *    - 统一 catch 网络错误和非 200 状态码，即使是 await 成功也可能 throw。
 *    - 尝试解析 JSON，如果失败降级为 null 并记录警告（因为我们的 API 约定始终返回 JSON）。
 */
export async function apiFetch<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
    const { token, credentials, ...init } = options;

    // 清理路径，确保 base 和 path 之间只有一个斜杠
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = path.startsWith('http') ? path : `${API_BASE}${cleanPath}`;

    const headers = new Headers(init.headers);
    if (token) {
        headers.set('x-admin-key', token);
    }

    // 如果未提供 Content-Type 且有 body，自动设置为 JSON
    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(url, { ...init, headers, credentials: credentials ?? 'include' });

    // 处理空响应 (如 204 No Content)
    const text = await res.text();
    let data: any = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        // 如果 JSON 解析失败但响应 OK，严格来说我们可能想要返回文本？
        // 但对于我们的 API，一切都是 JSON。除非为空，否则假设严格 JSON 解析失败是错误。
        console.warn('Failed to parse JSON response', e);
    }

    if (!res.ok) {
        throw new Error(data?.message || `HTTP ${res.status}`);
    }

    // 类型断言：这里我们信任泛型 T。
    // 在更严格的系统中，这里应该接受一个 Zod Schema 进行运行时验证 (Runtime Validation)。
    // 但为了保持轻量，目前采用信任契约的模式。
    return data as T;
}
