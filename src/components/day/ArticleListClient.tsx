/**
 * ArticleListClient - 文章列表客户端组件
 * 
 * 订阅 articlesStore，任务完成后自动刷新文章列表。
 * 作为 ArticleList.astro 的客户端接管层：
 * - SSR 首屏由 ArticleList.astro 渲染（SEO 友好）
 * - 客户端 hydration 后由此组件接管（支持动态更新）
 */
import { useStore } from '@nanostores/react';
import { articlesStore } from '../../lib/store/articlesStore';

import { toArticleSlug } from "@/lib/articles/loader";

interface ArticleItemProps {
    title: string;
    index: number;
    isRead?: boolean;
    date: string;
}

function ArticleItem({ title, index, isRead = false, date }: ArticleItemProps) {
    const slug = toArticleSlug(title);
    const href = `/${date}/${slug}`;

    return (
        <article className="group relative border-b border-stone-200/60 last:border-0 hover:bg-stone-50/50 -mx-4 px-4 transition-all duration-300 cursor-pointer">
            <a href={href} className="flex items-baseline py-5 w-full gap-6">
                {/* Number / Checkmark */}
                <span className={`inline-flex shrink-0 transition-colors duration-300 select-none w-8 justify-end ${isRead
                    ? 'text-amber-600/60 translate-y-[2px]'
                    : 'font-display italic text-2xl text-stone-300/80 group-hover:text-stone-500 group-hover:translate-x-1 transition-all'
                    }`}>
                    {isRead ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                    ) : (
                        String(index + 1).padStart(2, '0')
                    )}
                </span>

                {/* Title */}
                <h3 className={`flex-1 font-serif text-xl leading-relaxed transition-colors pr-4 ${isRead ? 'text-stone-400 decoration-stone-300 line-through decoration-1' : 'text-slate-900 group-hover:text-amber-900'
                    }`}>
                    {title}
                </h3>

                {/* Arrow Icon (Subtle) */}
                <div className="inline-flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-x-4 group-hover:translate-x-0 text-stone-300 self-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </div>
            </a>
        </article>
    );
}

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
    // 注意：SSR 时 store 可能有数据，客户端初次渲染时 store 为空但 props 有数据
    const hasStoreData = state.date === date && state.articles.length > 0;
    const articles = hasStoreData ? state.articles : initialArticles;

    return (
        <div className="flex-1">
            {articles.length > 0 ? (
                <div className="flex flex-col">
                    {articles.map((article, idx) => (
                        <ArticleItem
                            key={article.id}
                            title={article.title}
                            index={idx}
                            isRead={(article.read_levels || 0) > 0}
                            date={date}
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
