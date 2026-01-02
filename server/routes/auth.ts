import { Elysia } from 'elysia';
import { env } from '../config/env';

// Cookie 配置常量
const COOKIE_NAME = 'admin_key';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

// 从请求中获取 admin key（优先 header，其次 cookie）
function getAdminKey(request: Request): string | null {
    // 1. 尝试从 header 获取
    const headerKey = request.headers.get('x-admin-key');
    if (headerKey) return headerKey;

    // 2. 尝试从 cookie 获取
    const cookies = request.headers.get('cookie') || '';
    const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
    // 登录端点 - 设置 HttpOnly Cookie
    .post('/login', ({ body, set, error }: any) => {
        const key = body?.key;
        if (key !== env.ADMIN_KEY) {
            return error(401, { error: 'Unauthorized' });
        }

        // 设置 HttpOnly Cookie
        set.headers['Set-Cookie'] = [
            `${COOKIE_NAME}=${encodeURIComponent(key)}`,
            `Path=/`,
            `Max-Age=${COOKIE_MAX_AGE}`,
            `HttpOnly`,
            `SameSite=Lax`
        ].join('; ');

        return { success: true };
    })
    // 验证端点 - 同时支持 header 和 cookie
    .get('/check', ({ request, error }: any) => {
        const key = getAdminKey(request);
        if (key === env.ADMIN_KEY) return { status: 'ok' };
        return error(401, { error: 'Unauthorized' });
    });

// 导出工具函数供其他模块使用
export { getAdminKey };

