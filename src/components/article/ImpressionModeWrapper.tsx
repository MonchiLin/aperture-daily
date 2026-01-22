/**
 * ImpressionModeWrapper - Impression 风格包装器
 *
 * 这是一个 React Island 组件，用于在文章页面上覆盖 Impression 布局。
 * 当用户设置指定使用 Impression 风格时，此组件会渲染全屏覆盖层。
 *
 * 工作原理：
 * 1. hydration 后，读取 localStorage 中的用户设置
 * 2. 根据设置决定是否显示 Impression 布局
 * 3. 如果显示，会用 fixed 定位覆盖整个页面
 */
import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { settingsStore, type GenerationMode, type ReadingStyle } from '../../lib/store/settingsStore';
import { TriggerWord } from './TriggerWord';
import { WordPopover } from './WordPopover';
import { ChevronLeft, Type, Share2 } from 'lucide-react';
import type { SidebarWord } from '../../lib/articles/types';

interface ArticleContent {
    level: number;
    content: string;
}

interface ImpressionModeWrapperProps {
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
}

/** 活跃单词状态 */
interface ActiveWord {
    key: string;
    word: SidebarWord;
    rect: DOMRect;
}

export function ImpressionModeWrapper({
    title,
    dateLabel,
    category,
    sources,
    articles,
    words,
    generationMode,
    initialLevel = 1,
}: ImpressionModeWrapperProps) {
    const settings = useStore(settingsStore);
    const [activeLevel, setActiveLevel] = useState(initialLevel);
    const [mounted, setMounted] = useState(false);
    const [activeWord, setActiveWord] = useState<ActiveWord | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // 获取当前应该使用的阅读风格（兼容旧版本设置）
    const readingStyles = settings.readingStyles ?? {
        rss: 'default' as const,
        impression: 'impression' as const,
    };
    const readingStyle: ReadingStyle = mounted
        ? readingStyles[generationMode]
        : 'default';

    // 构建单词查找表
    const wordMap = new Map<string, SidebarWord>();
    for (const w of words) {
        wordMap.set(w.word.toLowerCase(), w);
    }

    // 处理单词点击
    const handleWordClick = useCallback((key: string, rect: DOMRect) => {
        const wordStr = key.split('-').pop()?.toLowerCase() || '';
        const wordData = wordMap.get(wordStr);
        if (wordData) {
            setActiveWord((prev) =>
                prev?.key === key ? null : { key, word: wordData, rect }
            );
        }
    }, [wordMap]);

    // 关闭弹窗
    const handleClosePopover = useCallback(() => {
        setActiveWord(null);
    }, []);

    // 当前文章内容
    const currentArticle = articles.find((a) => a.level === activeLevel);

    // 阅读时间估算
    const wordCount = currentArticle?.content.split(/\s+/).length || 0;
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 120));

    // 渲染带有高亮的文本
    const renderText = (text: string, paragraphIndex: number) => {
        const tokens = text.split(/(\s+)/);

        return tokens.map((token, tokenIndex) => {
            const cleanWord = token.replace(/[^a-zA-Z]/g, '').toLowerCase();
            const wordData = wordMap.get(cleanWord);
            const key = `${paragraphIndex}-${tokenIndex}-${cleanWord}`;

            if (wordData) {
                return (
                    <TriggerWord
                        key={key}
                        wordKey={key}
                        isActive={activeWord?.key === key}
                        onClick={handleWordClick}
                    >
                        {token}
                    </TriggerWord>
                );
            }
            return <span key={key}>{token}</span>;
        });
    };

    // 如果不需要 Impression 风格，不渲染任何内容
    if (readingStyle !== 'impression') {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] bg-[#F5F5F0] text-[#1A1A1A] font-serif selection:bg-[#D9480F]/20 overflow-auto"
        >
            {/* 纸质纹理背景 */}
            <div className="fixed inset-0 pointer-events-none opacity-40 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply z-0" />

            {/* 导航栏 */}
            <nav className="fixed top-0 w-full h-16 bg-[#F5F5F0]/95 backdrop-blur-sm border-b border-[#E6E6E1] z-50 flex items-center justify-between px-8">
                <div className="flex items-center gap-4 font-sans">
                    <button
                        onClick={() => window.history.back()}
                        className="hover:text-[#D9480F] transition-colors"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <span className="font-bold tracking-tight text-sm uppercase">UpWord</span>
                </div>
                <div className="flex gap-4 text-[#666666]">
                    <Type size={18} className="cursor-pointer hover:text-[#1A1A1A]" />
                    <Share2 size={18} className="cursor-pointer hover:text-[#1A1A1A]" />
                </div>
            </nav>

            <main className="relative z-10 max-w-[760px] mx-auto pt-32 pb-32 px-8">
                {/* Header */}
                <header className="mb-14 border-b border-[#1A1A1A] pb-8">
                    <div className="flex items-center gap-4 mb-6 font-sans text-xs font-bold tracking-widest text-[#666666] uppercase">
                        <span>Day</span>
                        <span className="w-px h-3 bg-[#CCCCCC]" />
                        <span>{dateLabel}</span>
                        <span className="w-px h-3 bg-[#CCCCCC]" />
                        <span>{readingMinutes} Minute{readingMinutes > 1 ? 's' : ''}</span>
                        {category && (
                            <>
                                <span className="w-px h-3 bg-[#CCCCCC]" />
                                <span className="bg-[#1A1A1A] text-white px-1.5 rounded-sm">
                                    {category}
                                </span>
                            </>
                        )}

                        {/* 难度切换器 */}
                        <span className="ml-auto flex gap-1">
                            {[1, 2, 3].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setActiveLevel(level)}
                                    className={`px-1.5 rounded-sm transition-colors ${level === activeLevel
                                        ? 'bg-[#1A1A1A] text-white'
                                        : 'text-[#999999] hover:text-[#666666]'
                                        }`}
                                >
                                    L{level}
                                </button>
                            ))}
                        </span>
                    </div>

                    <h1 className="text-5xl font-bold leading-[1.1] text-[#1A1A1A] tracking-tight">
                        {title}
                    </h1>
                </header>

                {/* Article Content */}
                <article className="text-[20px] leading-[1.7] text-[#2D2D2D]">
                    {currentArticle?.content.split('\n\n').map((paragraph, idx) => (
                        <p
                            key={idx}
                            className={`mb-6 ${idx === 0
                                ? 'first-letter:float-left first-letter:text-[5rem] first-letter:leading-[4rem] first-letter:font-bold first-letter:mr-3 first-letter:mt-[-0.5rem]'
                                : 'indent-8'
                                }`}
                        >
                            {renderText(paragraph, idx)}
                        </p>
                    ))}
                </article>

                {/* Sources */}
                {sources.length > 0 && (
                    <footer className="mt-16 pt-8 border-t border-[#E6E6E1] font-sans">
                        <h4 className="text-xs font-bold tracking-widest text-[#999999] uppercase mb-4">
                            Sources
                        </h4>
                        <ul className="text-sm text-[#666666] space-y-1">
                            {sources.map((url, idx) => {
                                let domain = url;
                                try {
                                    domain = new URL(url).hostname.replace(/^www\./, '');
                                } catch { }
                                return (
                                    <li key={idx} className="flex items-center gap-2">
                                        <span className="w-1 h-1 rounded-full bg-stone-300" />
                                        <a
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="hover:text-[#D9480F] transition-colors"
                                        >
                                            {domain}
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    </footer>
                )}
            </main>

            {/* Word Popover */}
            <AnimatePresence>
                {activeWord && (
                    <WordPopover
                        word={activeWord.word}
                        rect={activeWord.rect}
                        onClose={handleClosePopover}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
}
