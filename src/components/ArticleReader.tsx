import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { highlightedWordId, setHighlightedWord } from '../lib/store/wordHighlight';
import { audioState } from '../lib/store/audioStore';

export interface ArticleReaderProps {
    id?: string;
    title: string;
    publishDate: string;
    stats: {
        wordCount: number;
        readingTime: string;
        readCount: number;
    };
    level: 1 | 2 | 3;
    content: string[];
    targetWords?: string[];
    onLevelChange?: (level: 1 | 2 | 3) => void;
    className?: string;
    contentRef?: React.Ref<HTMLElement>;
}

export const ArticleReader: React.FC<ArticleReaderProps> = ({
    title,
    publishDate,
    stats,
    level,
    content,
    targetWords = [],
    onLevelChange,
    className,
    contentRef,
}) => {
    const activeId = useStore(highlightedWordId);

    // Auto-scroll logic when highlighted word changes
    useEffect(() => {
        if (!activeId) return;

        // Slight delay to ensure DOM is ready
        const selector = `[data-word="${activeId.toLowerCase()}"]`;
        const element = document.querySelector(selector);

        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [activeId]);

    return (
        <div className={clsx("w-full transition-all duration-500", className)}>
            {/* Paper Container */}
            <div className="relative mx-auto max-w-3xl bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 p-8 md:p-12 lg:p-16 ring-1 ring-black/5">

                {/* 顶部元数据与难度切换区域 */}
                <div className="flex flex-col gap-8 mb-12 pb-8 border-b border-stone-200/60">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-4">
                            <h1 className="text-3xl md:text-4xl font-bold text-stone-900 tracking-tight leading-tight font-display">
                                {title}
                            </h1>
                            <div className="flex items-center gap-4 text-sm font-medium text-stone-500 uppercase tracking-wider">
                                <span>{publishDate}</span>
                                <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                                <span>{stats.readCount} reads</span>
                            </div>
                        </div>

                        {/* Segmented Control for Level */}
                        <div className="bg-stone-100/80 p-1.5 rounded-xl inline-flex shrink-0 border border-stone-200/50">
                            {[1, 2, 3].map((l) => {
                                const isActive = level === l;
                                return (
                                    <button
                                        key={l}
                                        onClick={() => onLevelChange?.(l as 1 | 2 | 3)}
                                        className={clsx(
                                            "relative px-3 py-1 text-xs font-bold transition-colors duration-200 z-10 uppercase tracking-wide",
                                            isActive ? "text-stone-800" : "text-stone-400 hover:text-stone-600"
                                        )}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="level-indicator"
                                                className="absolute inset-0 bg-white rounded-lg shadow-sm border border-black/5 -z-10"
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                            />
                                        )}
                                        L{l}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 正文区 */}
                <article ref={contentRef} className="font-serif leading-loose text-lg md:text-xl text-stone-800 space-y-8">
                    {content.map((text, idx) => (
                        <TokenizedParagraph
                            key={idx}
                            index={idx}
                            text={text}
                            targetWords={targetWords}
                            activeWordId={activeId}
                        />
                    ))}
                </article>

                {/* 底部统计 */}
                <div className="mt-16 pt-8 border-t border-stone-200/60 text-center flex items-center justify-center gap-3 text-sm font-medium text-stone-400 uppercase tracking-widest">
                    <span>{stats.wordCount} words</span>
                    <span className="w-1 h-1 rounded-full bg-stone-300"></span>
                    <span>{stats.readingTime}</span>
                </div>
            </div>
        </div>
    );
};

// Memoized paragraph component to prevent regex re-computation and ensure stable offsets
const TokenizedParagraph = React.memo(({ index, text, targetWords, activeWordId }: {
    index: number;
    text: string;
    targetWords: string[];
    activeWordId: string | null;
}) => {
    // Audio State
    const audio = useStore(audioState);
    const isPlaying = audio.isPlaying;
    const isAudioActive = isPlaying && audio.currentIndex === index;
    const audioCharIndex = audio.charIndex;

    // Pre-calculate tokens and their offsets once per text change
    // We strictly use regex to find tokens and track their absolute start/end indices
    const tokens = React.useMemo(() => {
        const parts: { text: string; start: number; end: number; isWord: boolean }[] = [];
        let offset = 0;
        // Split by word boundary but keep delimiters. 
        // Note: JS split with capture group includes delimiters.
        const rawParts = text.split(/(\b)/);

        rawParts.forEach(part => {
            if (!part) return;
            const len = part.length;
            // Naive word check: has alphanumeric char
            const isWord = /\w/.test(part);

            parts.push({
                text: part,
                start: offset,
                end: offset + len,
                isWord
            });
            offset += len;
        });
        return parts;
    }, [text]);

    // Visual Style Update: text-[19px], leading-relaxed (1.8), #333 text color
    const pClassName = clsx(
        "mb-8 text-stone-800 transition-colors duration-300 rounded-lg p-1 -ml-1",
        isAudioActive && "bg-orange-50/50 border-l-4 border-orange-400 pl-4",
    );

    return (
        <p className={pClassName}>
            {tokens.map((token, i) => {
                const lowerPart = token.text.toLowerCase();
                const isTarget = token.isWord && targetWords.some(w => w.toLowerCase() === lowerPart);

                // Highlight Logic:
                // Check if audioCharIndex falls within token [start, end)
                const isSpeaking = isAudioActive && (audioCharIndex >= token.start && audioCharIndex < token.end);

                if (isSpeaking) {
                    return (
                        <span key={i} className="bg-orange-200 rounded px-0.5 -mx-0.5 transition-colors duration-75 text-gray-900 font-medium">
                            {token.text}
                        </span>
                    );
                }

                if (isTarget) {
                    const isHighlighted = activeWordId?.toLowerCase() === lowerPart;
                    return (
                        <motion.span
                            key={i}
                            data-word={lowerPart}
                            animate={isHighlighted ? {
                                scale: [1, 1.2, 1],
                                backgroundColor: ["rgba(255,255,255,0)", "rgba(234, 88, 12, 0.2)", "rgba(255,255,255,0)"],
                                transition: { duration: 0.6 }
                            } : {}}
                            style={{
                                color: '#ea580c',
                                fontWeight: 600,
                                borderBottom: '2px dotted #ea580c', // Thicker dotted line for better visibility
                                cursor: 'pointer',
                                display: 'inline-block'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setHighlightedWord(token.text);
                            }}
                        >
                            {token.text}
                        </motion.span>
                    );
                }

                return <span key={i}>{token.text}</span>;
            })}
        </p>
    );
});
