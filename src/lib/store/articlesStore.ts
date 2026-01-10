/**
 * 文章状态管理 (Articles Store)
 *
 * 基于 nanostores 的轻量级状态管理，用于跨组件共享文章数据。
 *
 * 数据流：
 *   SSR 渲染时：Astro 服务端获取数据 → 注入到 articlesStore → React 组件读取
 *   客户端刷新：refreshArticles() → API 请求 → 更新 store → 组件响应
 *
 * 为什么用 nanostores 而非 Redux/Zustand？
 * - 轻量：Astro 推荐的状态方案，与 Islands 架构完美配合
 * - 跨框架：同一 store 可被 React/Vue/Svelte 组件消费
 */

import { atom } from 'nanostores';
import { apiFetch } from '../api';
import type { Article, ArticlesState } from '../../types';

export type { Article, ArticlesState };

/** 全局文章状态 */
export const articlesStore = atom<ArticlesState>({
    date: '',
    articles: [],
    loading: false
});

/** 设置文章数据（通常由 SSR 调用） */
export const setArticles = (date: string, articles: Article[]) => {
    articlesStore.set({ date, articles, loading: false });
};

/**
 * 刷新文章数据（客户端）
 *
 * 适用场景：
 * - 管理员删除/修改文章后刷新
 * - 切换日期时重新获取
 */
export const refreshArticles = async (date: string) => {
    articlesStore.set({ ...articlesStore.get(), loading: true });
    try {
        const data = await apiFetch(`/api/day/${date}`);
        articlesStore.set({ date, articles: data.articles || [], loading: false });
    } catch (e) {
        console.error('Failed to refresh articles:', e);
        articlesStore.set({ ...articlesStore.get(), loading: false });
    }
};

