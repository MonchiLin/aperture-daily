import { atom } from 'nanostores';
import { apiFetch } from '../api';
import type { Article, ArticlesState } from '../../types';

export type { Article, ArticlesState };


export const articlesStore = atom<ArticlesState>({
    date: '',
    articles: [],
    loading: false
});

export const setArticles = (date: string, articles: Article[]) => {
    articlesStore.set({ date, articles, loading: false });
};

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
