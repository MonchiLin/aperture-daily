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
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import ArticleItemReact from './ArticleItemReact';
import type { Article } from '../../types';

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.1
        }
    }
};

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
            <AnimatePresence mode='wait'>
                {articles.length > 0 ? (
                    <motion.div
                        key="list"
                        className="flex flex-col"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                    >
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
                    </motion.div>
                ) : (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="py-12 flex flex-col items-center justify-center text-stone-400 gap-2"
                    >
                        <span className="font-serif italic text-base text-stone-500">No content.</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
