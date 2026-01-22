/**
 * ImpressionArticleLayout - Impression 风格的文章布局组件
 *
 * 特点：
 * - 单栏居中布局，无侧边栏
 * - 目标词汇使用 TriggerWord + WordPopover 交互
 * - 复古纸质感设计，首字下沉
 *
 * 与 DefaultArticleLayout 的区别：
 * - 无 Margin Notes 侧边栏
 * - 无 HistoricalEchoes (历史回响)
 * - 单词交互改为点击弹窗
 */
import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { TriggerWord } from './TriggerWord';
import { WordPopover } from './WordPopover';
import type { SidebarWord } from '../../lib/articles/types';

interface ArticleContent {
    level: number;
    content: string;
}

interface ImpressionArticleLayoutProps {
    /** 文章标题 */
    title: string;
    /** 日期标签 (如 "Wednesday, 2026/01/22") */
    dateLabel: string;
    /** 分类 */
    category?: string;
    /** 来源列表 */
    sources: string[];
    /** 三级文章内容 */
    articles: ArticleContent[];
    /** 词汇定义列表 */
    words: SidebarWord[];
    /** 当前显示的难度等级 */
    activeLevel: number;
    /** 切换难度等级的回调 */
    onLevelChange: (level: number) => void;
}

/** 活跃单词状态 */
interface ActiveWord {
    key: string;
    rect: DOMRect;
}

export function ImpressionArticleLayout({
    title,
    dateLabel,
    category,
    sources,
    articles,
    words,
    activeLevel,
    onLevelChange,
}: ImpressionArticleLayoutProps) {
    const [activeWord, setActiveWord] = useState<ActiveWord | null>(null);

    // 构建单词查找表
    const wordMap = useMemo(() => {
        const map = new Map<string, SidebarWord>();
        for (const w of words) {
            map.set(w.word.toLowerCase(), w);
        }
        return map;
    }, [words]);

    // 处理单词点击
    const handleWordClick = useCallback((key: string, rect: DOMRect) => {
        setActiveWord((prev) => (prev?.key === key ? null : { key, rect }));
    }, []);

    // 关闭弹窗
    const handleClosePopover = useCallback(() => {
        setActiveWord(null);
    }, []);

    // 当前文章内容
    const currentArticle = articles.find((a) => a.level === activeLevel);

    // 渲染带有高亮的段落
    const renderParagraph = (text: string, paragraphIndex: number) => {
        // 简单的单词匹配：将文本分割为单词和空格
        const tokens = text.split(/(\s+)/);

        return tokens.map((token, tokenIndex) => {
            const cleanWord = token.replace(/[^a-zA-Z]/g, '').toLowerCase();
            const wordData = wordMap.get(cleanWord);

            if (wordData) {
                const key = `${paragraphIndex}-${tokenIndex}-${cleanWord}`;
                return (
                    <TriggerWord
                        key={key}
                        wordKey={key}
                        isActive={activeWord?.key === key}
                        onClick={() => {
                            // 需要获取实际的 rect，这里使用一个临时方案
                            // 实际实现中 TriggerWord 会传递正确的 rect
                            handleWordClick(key, new DOMRect());
                        }}
                    >
                        {token}
                    </TriggerWord>
                );
            }
            return <span key={`${paragraphIndex}-${tokenIndex}`}>{token}</span>;
        });
    };

    // 阅读时间估算
    const wordCount = currentArticle?.content.split(/\s+/).length || 0;
    const readingMinutes = Math.max(1, Math.ceil(wordCount / 120));

    return (
        <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-serif selection:bg-[#D9480F]/20">
            {/* 纸质纹理背景 */}
            <div className="fixed inset-0 pointer-events-none opacity-40 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply z-0" />

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
                                    onClick={() => onLevelChange(level)}
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
                            {renderParagraph(paragraph, idx)}
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
                {activeWord && wordMap.get(activeWord.key.split('-').pop()!) && (
                    <WordPopover
                        word={wordMap.get(activeWord.key.split('-').pop()!)!}
                        rect={activeWord.rect}
                        onClose={handleClosePopover}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
