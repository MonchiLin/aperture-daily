/**
 * WordPopover - Impression 风格的单词详情弹窗
 *
 * 显示单词的音标、词性、释义等信息。
 * 采用复古编辑风格的卡片设计。
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Bookmark, ArrowRight } from 'lucide-react';
import type { SidebarWord } from '../../lib/articles/types';

interface WordPopoverProps {
    /** 单词数据 */
    word: SidebarWord;
    /** 触发元素的位置信息 */
    rect: { top: number; left: number; width: number; height: number; bottom: number }; // Relaxed type
    /** 关闭回调 */
    onClose: () => void;
}

export function WordPopover({ word, rect, onClose }: WordPopoverProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [mounted, setMounted] = useState(false);

    // 计算弹窗位置
    useEffect(() => {
        setMounted(true);
        const centerX = rect.left + rect.width / 2;
        const y = rect.bottom + 16;
        setPos({
            x: Math.max(200, Math.min(centerX, window.innerWidth - 200)),
            y: Math.min(y, window.innerHeight - 300),
        });
    }, [rect]);

    // 点击外部关闭
    const handleOutsideClick = useCallback(
        (e: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
                onClose();
            }
        },
        [onClose]
    );

    // ESC 键关闭
    const handleEsc = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        },
        [onClose]
    );

    useEffect(() => {
        // 延迟添加监听器，避免立即触发关闭
        const timer = setTimeout(() => {
            window.addEventListener('mousedown', handleOutsideClick);
        }, 10);
        window.addEventListener('keydown', handleEsc);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('mousedown', handleOutsideClick);
            window.removeEventListener('keydown', handleEsc);
        };
    }, [handleOutsideClick, handleEsc]);

    // 朗读单词
    const speakWord = () => {
        const utterance = new SpeechSynthesisUtterance(word.word);
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
    };

    if (!mounted) return null;

    const popoverContent = (
        <AnimatePresence>
            <motion.div
                ref={cardRef}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="fixed z-[9999] w-[340px]"
                style={{ left: pos.x, top: pos.y, transform: 'translateX(-50%)' }}
            >
                <div
                    className="relative overflow-hidden rounded-lg bg-white shadow-xl border border-stone-200"
                    style={{
                        boxShadow:
                            '0 4px 20px -4px rgba(0, 0, 0, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.05)',
                    }}
                >
                    {/* 顶部装饰线 */}
                    <div className="h-1 w-full bg-[#D9480F]" />

                    <div className="p-5 font-serif">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="text-2xl font-bold text-[#1A1A1A] tracking-tight mb-1">
                                    {word.word}
                                </h3>
                                <div className="flex items-center gap-2 text-[#666666]">
                                    {word.definitions[0] && (
                                        <span className="text-sm italic">
                                            {word.definitions[0].pos}
                                        </span>
                                    )}
                                    {word.phonetic && (
                                        <span className="text-xs font-sans">
                                            /{word.phonetic}/
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={speakWord}
                                className="text-[#666666] hover:text-[#D9480F] transition-colors"
                            >
                                <Volume2 size={16} />
                            </button>
                        </div>

                        {/* 分隔线 */}
                        <div className="h-px w-12 bg-[#D9480F]/30 mb-4" />

                        {/* 定义列表 */}
                        <div className="space-y-2 mb-4">
                            {word.definitions.map((def, idx) => (
                                <p
                                    key={idx}
                                    className="text-[15px] leading-relaxed text-[#2D2D2D]"
                                >
                                    <span className="text-[#666666] italic mr-1">
                                        {def.pos}
                                    </span>
                                    {def.definition}
                                </p>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between pt-3 border-t border-stone-100 font-sans">
                            <button className="text-[#666666] hover:text-[#D9480F] transition-colors">
                                <Bookmark size={16} />
                            </button>
                            <button className="flex items-center gap-1 text-xs font-bold text-[#D9480F] hover:text-[#B33606] transition-colors uppercase tracking-wide">
                                DETAILS <ArrowRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );

    return createPortal(popoverContent, document.body);
}
