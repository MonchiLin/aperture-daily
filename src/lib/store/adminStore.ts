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
export async function login(key: string): Promise<boolean> {
    try {
        await apiFetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
            credentials: 'include' // 接收 Set-Cookie
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

