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

// 登录并设置 HttpOnly Cookie
// 同时调用前端和后端登录接口，确保 Cookie 设置到正确的域名
export async function login(key: string): Promise<boolean> {
    try {
        // 1. 调用前端登录接口（设置 Cookie 到 pages.dev 域名）
        //    这样 SSR 阶段可以读取到 Cookie
        const frontendRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
            credentials: 'include'
        });

        if (!frontendRes.ok) {
            throw new Error('Frontend login failed');
        }

        // 2. 调用后端登录接口（设置 Cookie 到 hf.space 域名）
        //    虽然这个 Cookie SSR 读不到，但客户端 API 调用需要
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

