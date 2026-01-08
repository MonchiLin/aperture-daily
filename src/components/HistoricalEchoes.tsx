/**
 * Historical Echoes - The Memory Spirit
 * 
 * Replaces MemorySpirit.tsx and HighlightManager.tsx.
 * Features:
 * - Hybrid Architecture (Event Delegation + Nanostores)
 * - Framer Motion for entrance/exit
 * - Radix-like accessible portal
 */
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Popover, ConfigProvider } from 'antd';
import { interactionStore, activeInteraction } from '../lib/store/interactionStore';

export default function HistoricalEchoes() {
    // 1. Subscribe to Store (Source of Truth)
    const interaction = useStore(activeInteraction);
    const { echoData } = useStore(interactionStore);

    // 2. Client-side only
    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true); }, []);

    if (!isClient) return null;

    // Check if we have valid data in the store
    const isActive = !!interaction?.current && !!echoData && echoData.length > 0;
    const rect = interaction?.current?.rect;

    // Portal Target
    // Strategy: We use AntD's Popover for robust positioning (collision detection, flipping),
    // but we use our own Event Delegation architecture to drive it.
    // We achieve this by rendering a "Phantom Anchor" div at the exact coordinates of the target word.
    return createPortal(
        <>
            {/* 1. Phantom Anchor - AntD positions relative to this */}
            {isActive && rect && (
                <div
                    style={{
                        position: 'fixed',
                        top: rect.top,
                        left: rect.left,
                        width: rect.width,
                        height: rect.height,
                        zIndex: -1,
                        pointerEvents: 'none'
                    }}
                >
                    <ConfigProvider
                        theme={{
                            components: {
                                Popover: {
                                    zIndexPopup: 9999,
                                    marginXS: 0,
                                    colorBgElevated: 'transparent',
                                    boxShadowSecondary: 'none' // Remove AntD default shadow
                                }
                            }
                        }}
                    >
                        <Popover
                            open={true}
                            placement="bottom"
                            arrow={false}
                            rootClassName="historical-popover-root"
                            getPopupContainer={() => document.body} // Ensure it mounts to body
                            content={
                                <div
                                    onMouseEnter={() => window.dispatchEvent(new Event('historical-popup-enter'))}
                                    onMouseLeave={() => window.dispatchEvent(new Event('historical-popup-leave'))}
                                    className="pt-2" // Spacing
                                >
                                    <motion.div
                                        initial={{ opacity: 0, y: 8, scale: 0.96, filter: 'blur(4px)' }}
                                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                                        exit={{ opacity: 0, y: 4, scale: 0.98, filter: 'blur(2px)' }}
                                        transition={{ type: "spring", stiffness: 380, damping: 20 }}
                                        className="relative bg-[#fffdf9]/95 backdrop-blur-xl border border-[#efe8d8] rounded-2xl shadow-[0_25px_60px_-12px_rgba(45,25,0,0.15),0_0_1px_rgba(0,0,0,0.1)] p-6 min-w-[340px] max-w-[420px] text-left"
                                    >
                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-5 leading-none">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-600 ring-4 ring-amber-600/10" />
                                                <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-700/90 font-sans">
                                                    Historical Echoes
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-mono font-medium text-stone-400/80 tracking-tighter">
                                                {echoData[0]?.date}
                                            </span>
                                        </div>

                                        {/* Content List */}
                                        <div className="space-y-6">
                                            {echoData.slice(0, 3).map((m: any, idx: number) => (
                                                <div key={idx} className={idx > 0 ? "pt-5 border-t border-stone-200/60" : ""}>
                                                    {/* Quote */}
                                                    <div className="relative mb-3.5">
                                                        <span className="absolute -left-4 top-0 text-3xl font-serif text-amber-200/50 leading-none">“</span>
                                                        <div className="text-[16px] font-serif leading-[1.6] text-stone-900 italic font-medium selection:bg-amber-100">
                                                            {m.snippet}
                                                        </div>
                                                    </div>

                                                    {/* Footer */}
                                                    <div className="flex items-end justify-between gap-6">
                                                        <div className="flex-1">
                                                            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-0.5">Source</div>
                                                            <div className="text-[12px] font-semibold text-stone-700 leading-snug underline decoration-stone-200 decoration-2 underline-offset-4 line-clamp-2">
                                                                {m.articleTitle}
                                                            </div>
                                                        </div>

                                                        <a
                                                            href={`/article/${m.articleId}`}
                                                            className="group flex items-center gap-1.5 shrink-0 px-3 py-1.5 bg-stone-50 hover:bg-amber-50 rounded-full border border-stone-200/60 hover:border-amber-200 transition-all duration-300"
                                                        >
                                                            <span className="text-[10px] font-black text-stone-600 group-hover:text-amber-700 uppercase tracking-tight">
                                                                {idx === 0 ? "Revisit" : "View"}
                                                            </span>
                                                            <span className="text-xs text-stone-400 group-hover:text-amber-500 transform transition-transform group-hover:translate-x-0.5">→</span>
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Overflow Indicator */}
                                        {echoData.length > 3 && (
                                            <div className="mt-6 pt-3.5 border-t-2 border-dotted border-stone-200 flex items-center justify-center gap-2">
                                                <span className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded">
                                                    + {echoData.length - 3}
                                                </span>
                                                <span className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.2em]">
                                                    Deep Memories Remaining
                                                </span>
                                            </div>
                                        )}
                                    </motion.div>
                                </div>
                            }
                        >
                            {/* The Anchor itself needs to be visible to AntD but invisible to user */}
                            <div className="w-full h-full" />
                        </Popover>
                    </ConfigProvider>
                </div>
            )}
        </>,
        document.body
    );
}
