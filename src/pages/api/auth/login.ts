/**
 * 前端登录端点 - 设置 Cookie 到前端域名
 * 
 * 由于前端 (pages.dev) 和后端 (hf.space) 域名不同，
 * 后端设置的 Cookie 无法在 SSR 阶段读取。
 * 此端点在前端域名设置 Cookie，解决跨域问题。
 */
import type { APIRoute } from 'astro';
import { apiFetch } from '@/lib/api';

const COOKIE_NAME = 'admin_key';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 年

export const POST: APIRoute = async ({ request, url }) => {
    try {
        const body = await request.json() as { key?: string };
        const key = body?.key;

        if (!key) {
            return new Response(JSON.stringify({ error: 'Missing key' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 调用后端验证密钥
        try {
            await apiFetch('/api/auth/check', { token: key });
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid key' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 设置 Cookie 到前端域名
        const secure = url.protocol === 'https:';
        const cookieValue = [
            `${COOKIE_NAME}=${encodeURIComponent(key)}`,
            `Path=/`,
            `Max-Age=${COOKIE_MAX_AGE}`,
            `HttpOnly`,
            secure ? 'Secure' : '',
            'SameSite=Lax'  // 同域可以用 Lax
        ].filter(Boolean).join('; ');

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': cookieValue
            }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

// 登出端点
export const DELETE: APIRoute = async ({ url }) => {
    const secure = url.protocol === 'https:';
    const cookieValue = [
        `${COOKIE_NAME}=`,
        `Path=/`,
        `Max-Age=0`,
        `HttpOnly`,
        secure ? 'Secure' : '',
        'SameSite=Lax'
    ].filter(Boolean).join('; ');

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieValue
        }
    });
};
