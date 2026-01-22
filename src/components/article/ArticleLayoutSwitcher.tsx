/**
 * ArticleLayoutSwitcher - 阅读风格切换器
 *
 * 根据用户设置和文章生成模式，决定使用哪个布局渲染文章。
 * 这是一个客户端组件，在 hydration 时读取 localStorage 中的设置。
 *
 * 设计决策：
 * - 使用 React 客户端组件而非 Astro SSR 条件渲染
 * - 因为用户设置存储在 localStorage，SSR 时无法访问
 * - 首次渲染默认使用 'default' 风格，避免布局跳动
 */
import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { settingsStore, type GenerationMode, type ReadingStyle } from '../../lib/store/settingsStore';
import { ImpressionArticleLayout } from './ImpressionArticleLayout';
import type { SidebarWord } from '../../lib/articles/types';

interface ArticleContent {
    level: number;
    content: string;
}

interface ArticleLayoutSwitcherProps {
    /** 文章标题 */
    title: string;
    /** 日期标签 */
    dateLabel: string;
    /** 分类 */
    category?: string;
    /** 来源列表 */
    sources: string[];
    /** 三级文章内容 */
    articles: ArticleContent[];
    /** 词汇定义列表 */
    words: SidebarWord[];
    /** 文章生成模式 */
    generationMode: GenerationMode;
    /** 初始难度等级 */
    initialLevel?: number;
    /** 默认布局渲染函数（用于 SSR 后备） */
    defaultLayoutSlot?: React.ReactNode;
}

export function ArticleLayoutSwitcher({
    title,
    dateLabel,
    category,
    sources,
    articles,
    words,
    generationMode,
    initialLevel = 1,
    defaultLayoutSlot,
}: ArticleLayoutSwitcherProps) {
    const settings = useStore(settingsStore);
    const [activeLevel, setActiveLevel] = useState(initialLevel);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // 获取当前应该使用的阅读风格
    const readingStyle: ReadingStyle = mounted
        ? settings.readingStyles[generationMode]
        : 'default';

    // 如果是 impression 风格，使用 ImpressionArticleLayout
    if (readingStyle === 'impression') {
        return (
            <ImpressionArticleLayout
                title={title}
                dateLabel={dateLabel}
                category={category}
                sources={sources}
                articles={articles}
                words={words}
                activeLevel={activeLevel}
                onLevelChange={setActiveLevel}
            />
        );
    }

    // 默认风格：渲染传入的 slot 或返回 null（由 Astro 处理）
    return defaultLayoutSlot ? <>{defaultLayoutSlot}</> : null;
}
