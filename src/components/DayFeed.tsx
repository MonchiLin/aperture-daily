/**
 * 每日文章列表 - React 版本 (支持 SSR + 响应式更新)
 * 
 * ⚠️ AdminDrawer 已移至页面级别，由 SSR 条件渲染
 */
import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { articlesStore, setArticles, type Article } from '../lib/store/articlesStore';
import { initFromSSR } from '../lib/store/adminStore';
import WordsDrawer from './WordsDrawer';

interface WordData {
    new_words: string[];
    review_words: string[];
    new_count: number;
    review_count: number;
}

// SSR 预取的管理员数据
interface AdminData {
    isAdmin: boolean;
    tasks: any[];
}

interface Props {
    date: string;
    initialArticles: Article[];
    wordData?: WordData;
    adminData?: AdminData | null;
    /** Slot for admin drawer (rendered conditionally by page) */
    adminSlot?: React.ReactNode;
}

export default function DayFeed({ date, initialArticles, wordData, adminData, adminSlot }: Props) {
    const { articles, date: storeDate, loading } = useStore(articlesStore);

    // 同步 SSR 数据到全局状态
    useEffect(() => {
        // 同步文章数据
        if (storeDate !== date) {
            setArticles(date, initialArticles);
        }
        // 同步管理员数据
        initFromSSR(adminData || null);
    }, [date, initialArticles, storeDate, adminData]);

    // 使用当前生效的数据 (Store 优先)
    const displayArticles = storeDate === date ? articles : initialArticles;

    // 格式化日期显示
    const dateObj = new Date(date + 'T00:00:00');
    const dayNum = dateObj.getDate();
    const monthYear = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
        <div className="flex flex-col h-full font-serif text-slate-900">
            {/* Compact Header */}
            <div className="border-b border-slate-900 mb-6 pb-2 flex items-baseline justify-between select-none">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">
                    {dayNum} <span className="text-xl font-normal italic text-stone-500 ml-1">{monthYear}</span>
                    {loading && <span className="ml-4 text-xs font-sans font-normal text-amber-600 animate-pulse uppercase tracking-widest">Updating...</span>}
                </h2>
                <div className="flex items-center gap-4">
                    <WordsDrawer date={date} wordData={wordData} />
                    {adminSlot}
                </div>
            </div>


            {/* Compact List */}
            <div className="flex-1">
                {displayArticles && displayArticles.length > 0 ? (
                    <div className="flex flex-col">
                        {displayArticles.map((article, idx) => {
                            const isRead = (article.read_levels || 0) > 0;
                            return (
                                <article key={article.id} className="group relative border-b border-stone-200 last:border-0 hover:bg-stone-50 -mx-4 px-4 transition-colors cursor-pointer">
                                    <a href={`/article/${article.id}`} className="flex items-center py-3 w-full gap-4">
                                        {/* Number / Checkmark */}
                                        <span className={`inline-flex items-center justify-center text-xs font-bold font-sans w-6 shrink-0 transition-colors ${isRead ? 'text-amber-600/60' : 'text-stone-300 group-hover:text-stone-500'
                                            }`}>
                                            {isRead ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                String(idx + 1).padStart(2, '0')
                                            )}
                                        </span>

                                        {/* Title */}
                                        <h3 className={`inline-flex items-center flex-1 font-serif text-lg font-medium transition-colors truncate pr-4 ${isRead ? 'text-stone-500' : 'text-slate-900 group-hover:text-amber-900'
                                            }`}>
                                            {article.title}
                                        </h3>

                                        {/* Arrow Icon (Only visible on hover) */}
                                        <div className="inline-flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0 text-stone-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </a>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-stone-400 gap-2">
                        <span className="font-serif italic text-base text-stone-500">No content.</span>
                    </div>
                )}
            </div>
        </div>
    );
}
