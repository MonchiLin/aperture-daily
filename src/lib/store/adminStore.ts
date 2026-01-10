import { atom, onMount } from 'nanostores';
import { apiFetch } from '../api';

// ========== Stores ==========

// 是否是管理员
export const isAdminStore = atom<boolean>(false);

// 任务状态摘要（用于 MANAGE 按钮指示器）
export interface TaskStatus {
    hasRunning: boolean;
    hasFailed: boolean;
    hasQueued: boolean;
}
export const taskStatusStore = atom<TaskStatus>({
    hasRunning: false,
    hasFailed: false,
    hasQueued: false
});

// ========== Actions ==========

// 更新任务状态（由 useAdminTasks 调用）
export function updateTaskStatus(tasks: { status: string }[]) {
    taskStatusStore.set({
        hasRunning: tasks.some(t => t.status === 'running'),
        hasFailed: tasks.some(t => t.status === 'failed'),
        hasQueued: tasks.some(t => t.status === 'queued')
    });
}

// 登录 Action (Dual-Domain Login Strategy)
// 
// 核心挑战：
// 我们的应用架构通常包含两个域名/端口：
// 1. Frontend (SSR Node): 用于渲染页面 (localhost:4321 或 pages.dev)
// 2. Backend (API): 用于数据接口 (localhost:3000 或 hf.space)
// 
// HttpOnly Cookie 受到浏览器的同源策略限制。
// 为了解决这个问题，我们需要在“两个地方”都种下 Cookie：
// 1. 前端域：为了 SSR 渲染时能携带 Cookie (layout 鉴权)。
// 2. 后端域：为了客户端 JS 发起 Fetch 请求时能携带 Cookie (数据鉴权)。
export async function login(key: string): Promise<boolean> {
    try {
        // 1. 设置 Frontend SSR Cookie
        // 调用 Astro 自身的 API 路由 (/src/pages/api/auth/login.ts)
        // 这个 Cookie 将属于当前页面所在的域名。
        const frontendRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
            credentials: 'include'
        });

        if (!frontendRes.ok) {
            throw new Error('Frontend login failed');
        }

        // 2. 设置 Backend API Cookie
        // 调用独立后端的 API 路由 (server/routes/auth.ts)
        // 这个 Cookie 将属于后端 API 所在的域名 (如果是分离部署的话)。
        await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
            credentials: 'include'
        });

        isAdminStore.set(true);
        return true;
    } catch {
        isAdminStore.set(false);
        return false;
    }
}

// 验证当前 Cookie 是否有效
export async function checkAuth(): Promise<boolean> {
    try {
        await apiFetch('/api/auth/check', { credentials: 'include' });
        isAdminStore.set(true);
        return true;
    } catch {
        isAdminStore.set(false);
        return false;
    }
}

// 从 SSR 数据初始化（页面加载时调用）
export function initFromSSR(adminData: { isAdmin: boolean; tasks: { status: string }[] } | null) {
    if (adminData?.isAdmin) {
        isAdminStore.set(true);
        updateTaskStatus(adminData.tasks);
    } else {
        isAdminStore.set(false);
    }
}

// ========== 初始化 ==========

// 客户端挂载时验证 Cookie
onMount(isAdminStore, () => {
    if (typeof window === 'undefined') return;
    checkAuth();
});

