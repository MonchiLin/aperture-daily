import { useStore } from '@nanostores/react';
import { articlesStore } from '../../lib/store/articlesStore';
import ArticleItemReact from './ArticleItemReact';
import type { Article } from '../../types';

interface ArticleListClientProps {
    /** 当前日期，用于过滤 store 中的数据 */
    date: string;
    /** SSR 传递的初始数据，解决 Hydration Mismatch */
    initialArticles?: Article[];
}

export default function ArticleListClient({ date, initialArticles = [] }: ArticleListClientProps) {
    const state = useStore(articlesStore);

    // 优先使用 store 中的数据（如果日期匹配且有数据）
    // 否则 fallback 到 initialArticles (SSR 提供)
    const hasStoreData = state.date === date && state.articles.length > 0;
    const articles = hasStoreData ? state.articles : initialArticles;

    return (
        <div className="flex-1">
            {articles.length > 0 ? (
                <div className="flex flex-col">
                    {articles.map((article, idx) => (
                        <ArticleItemReact
                            key={article.id}
                            title={article.title}
                            index={idx}
                            isRead={(article.read_levels || 0) > 0}
                            date={date}
                            generationMode={article.generation_mode}
                        />
                    ))}
                </div>
            ) : (
                <div className="py-12 flex flex-col items-center justify-center text-stone-400 gap-2">
                    <span className="font-serif italic text-base text-stone-500">No content.</span>
                </div>
            )}
        </div>
    );
}
