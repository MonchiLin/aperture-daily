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
import { useArticleMetadata } from '../lib/hooks/useArticleMetadata';
import { Volume2 } from 'lucide-react';

// --- Subcomponents ---

const DefinitionSection = ({ definition }: { definition: any }) => {
    if (!definition) return null;

    const playAudio = (url?: string) => {
        if (url) new Audio(url).play().catch(e => console.error(e));
    };

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <h3 className="text-4xl font-bold text-stone-900 font-serif tracking-tight leading-none">
                        {definition.word}
                    </h3>
                    {/* Audio Button */}
                    {definition.audio && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                playAudio(definition.audio);
                            }}
                            className="flex items-center justify-center w-8 h-8 rounded-full bg-stone-100 text-stone-500 hover:text-[#D9480F] hover:bg-amber-50 transition-colors"
                            title="Play pronunciation"
                        >
                            <Volume2 size={16} />
                        </button>
                    )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                    {definition.phonetic && (
                        <span className="font-sans text-sm text-stone-400 font-medium">
                            {definition.phonetic.startsWith('/') ? definition.phonetic : `/${definition.phonetic}/`}
                        </span>
                    )}
                    {definition.pos && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#D9480F] opacity-80">
                            {definition.pos}
                        </span>
                    )}
                </div>
            </div>

            {/* Definition Text */}
            {definition.definition && (
                <p className="text-[16px] leading-relaxed text-stone-800 font-serif border-l-2 border-[#D9480F]/30 pl-3.5 py-0.5">
                    {definition.definition}
                </p>
            )}
        </div>
    );
};

const EchoHeader = ({ date }: { date: string }) => (
    <div className="flex items-center justify-between mb-5 leading-none">
        <div className="flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-600 ring-4 ring-amber-600/10" />
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-700/90 font-sans">
                Historical Echoes
            </span>
        </div>
        <span className="text-[10px] font-mono font-medium text-stone-400/80 tracking-tighter">
            {date}
        </span>
    </div>
);

const EchoItem = ({ echo, index }: { echo: any; index: number }) => (
    <div className={index > 0 ? "pt-5 border-t border-stone-200/60" : ""}>
        {/* Quote */}
        <div className="relative mb-3.5">
            <span className="absolute -left-4 top-0 text-3xl font-serif text-amber-200/50 leading-none">“</span>
            <div className="text-[16px] font-serif leading-[1.6] text-stone-900 italic font-medium selection:bg-amber-100">
                {echo.snippet}
            </div>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-between gap-6">
            <div className="flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-0.5">Source</div>
                <div className="text-[12px] font-semibold text-stone-700 leading-snug underline decoration-stone-200 decoration-2 underline-offset-4 line-clamp-2">
                    {echo.articleTitle}
                </div>
            </div>

            <a
                href={`/${echo.date}/${echo.articleSlug || echo.articleTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                className="group flex items-center gap-1.5 shrink-0 px-3 py-1.5 bg-stone-50 hover:bg-amber-50 rounded-full border border-stone-200/60 hover:border-amber-200 transition-all duration-300"
            >
                <span className="text-[10px] font-black text-stone-600 group-hover:text-amber-700 uppercase tracking-tight">
                    {index === 0 ? "Revisit" : "View"}
                </span>
                <span className="text-xs text-stone-400 group-hover:text-amber-500 transform transition-transform group-hover:translate-x-0.5">→</span>
            </a>
        </div>
    </div>
);

const EchoList = ({ echoes }: { echoes: any[] }) => {
    if (!echoes || echoes.length === 0) return null;

    return (
        <div className="space-y-6">
            {echoes.slice(0, 3).map((m: any, idx: number) => (
                <EchoItem key={idx} echo={m} index={idx} />
            ))}
        </div>
    );
};

const OverflowIndicator = ({ count }: { count: number }) => {
    if (count <= 3) return null;
    return (
        <div className="mt-6 pt-3.5 border-t-2 border-dotted border-stone-200 flex items-center justify-center gap-2">
            <span className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded">
                + {count - 3}
            </span>
            <span className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.2em]">
                Deep Memories Remaining
            </span>
        </div>
    );
};

// --- Main Component ---

interface HistoricalEchoesProps {
    showDefinition?: boolean;
    articleId?: string;
}

export default function HistoricalEchoes({ showDefinition = false, articleId }: HistoricalEchoesProps) {
    // 0. Debug Logging (Silent)
    useArticleMetadata(articleId);

    // 1. Subscribe to Store (Source of Truth)
    const interaction = useStore(activeInteraction);
    const { echoData, definition } = useStore(interactionStore);

    // 2. Client-side only
    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true); }, []);

    if (!isClient) return null;

    // Check if we have valid data in the store
    const hasEchoes = !!echoData && echoData.length > 0;
    const hasDefinition = showDefinition && !!definition;
    const isActive = !!interaction?.current && (hasEchoes || hasDefinition);
    const rect = interaction?.current?.rect;

    if (!isActive || !rect) return null;

    // Portal Target
    return createPortal(
        <>
            {/* 1. Phantom Anchor - AntD positions relative to this */}
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
                                    {/* Definition Section */}
                                    {hasDefinition && <DefinitionSection definition={definition} />}

                                    {/* Divider if we also have echoes */}
                                    {hasDefinition && hasEchoes && <div className="h-px w-full bg-stone-200 mt-6" />}

                                    {/* Header (Only show if we have echoes) */}
                                    {hasEchoes && <EchoHeader date={echoData[0]?.date} />}

                                    {/* Content List */}
                                    {hasEchoes && <EchoList echoes={echoData} />}

                                    {/* Overflow Indicator */}
                                    {hasEchoes && <OverflowIndicator count={echoData.length} />}
                                </motion.div>
                            </div>
                        }
                    >
                        {/* The Anchor itself needs to be visible to AntD but invisible to user */}
                        <div className="w-full h-full" />
                    </Popover>
                </ConfigProvider>
            </div>
        </>,
        document.body
    );
}
