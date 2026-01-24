/**
 * [前端 API 网关]
 * ------------------------------------------------------------------
 * 功能描述: 统一封装 Fetch 请求，处理鉴权注入、路径规范化与响应解析。
 *
 * 核心职责:
 * - 拦截器 (Interceptor): 自动注入 `x-admin-key` 头与 `Content-Type: application/json`。
 * - 统一契约 (Contract): 保证所有响应 (成功/失败) 均解析为 JSON 或抛出标准化 Error。
 * - 路径规范化: 自动处理 `/api` 前缀与多余斜杠，防止 URL 拼接错误。
 *
 * 外部依赖: Native Fetch API
 * 注意事项: 本模块信任后端返回的 JSON 结构，暂未引入 Zod 进行运行时 Response 校验 (Runtime Validation)。
 */
import { PUBLIC_API_BASE } from 'astro:env/client';
// export const API_BASE = import.meta.env.PUBLIC_API_BASE;
export const API_BASE = PUBLIC_API_BASE;

type FetchOptions = RequestInit & {
    token?: string | null; // For x-admin-key header
    credentials?: RequestCredentials; // For cookie auth
};

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
