import { useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { interactionStore } from '../lib/store/interactionStore';
import { Popover, ConfigProvider } from 'antd';

export default function MemorySpirit() {
    const { memoryData } = useStore(interactionStore);
    const [rect, setRect] = useState<{ top: number, left: number, width: number, height: number } | null>(null);
    const [open, setOpen] = useState(false);
    const closeTimerRef = useRef<any>(null);

    // Track the word's position when it's hovered
    useEffect(() => {
        const handleHover = (e: any) => {
            const { word, target } = e.detail;
            if (word && target) {
                const r = target.getBoundingClientRect();
                if (r.top > 0) {
                    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
                    setOpen(true);
                    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                }
            } else if (!word) {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                closeTimerRef.current = setTimeout(() => {
                    setOpen(false);
                }, 600);
            }
        };
        window.addEventListener('word-hover' as any, handleHover);
        return () => window.removeEventListener('word-hover' as any, handleHover);
    }, []);

    const memories = memoryData || [];
    const hasData = memories.length > 0;

    // Feature up to 3 memories
    const featuredMemories = memories.slice(0, 3);
    const extraCount = memories.length > 3 ? memories.length - 3 : 0;

    const content = hasData ? (
        <div
            className="p-6 min-w-[340px] max-w-[420px] text-left antialiased"
            onMouseEnter={() => {
                if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
                setOpen(true);
            }}
            onMouseLeave={() => {
                setOpen(false);
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-5 leading-none">
                <div className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-600 ring-4 ring-amber-600/10" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-700/90 font-sans">
                        Historical Echoes
                    </span>
                </div>
                {memories.length > 0 && (
                    <span className="text-[10px] font-mono font-medium text-stone-400/80 tracking-tighter">
                        {memories[0].date}
                    </span>
                )}
            </div>

            <div className="space-y-6">
                {featuredMemories.map((m, idx) => (
                    <div key={idx} className={idx > 0 ? "pt-5 border-t border-stone-200/60" : ""}>
                        {/* Quote Content */}
                        <div className="relative mb-3.5">
                            <span className="absolute -left-4 top-0 text-3xl font-serif text-amber-200/50 leading-none">“</span>
                            <div className="text-[16px] font-serif leading-[1.6] text-stone-900 italic font-medium">
                                {m.snippet}
                            </div>
                        </div>

                        {/* Source Footer */}
                        <div className="flex items-end justify-between gap-6">
                            <div className="flex-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-0.5">Source</div>
                                <div className="text-[12px] font-semibold text-stone-700 leading-snug whitespace-normal break-words underline decoration-stone-200 decoration-2 underline-offset-4">
                                    {m.articleTitle}
                                </div>
                                {idx > 0 && (
                                    <div className="text-[10px] font-mono text-stone-400 mt-1">{m.date}</div>
                                )}
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

            {/* Pagination / Continuation */}
            {extraCount > 0 && (
                <div className="mt-6 pt-3.5 border-t-2 border-dotted border-stone-200 flex items-center justify-center gap-2">
                    <span className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded">
                        + {extraCount}
                    </span>
                    <span className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.2em]">
                        Deep Memories Remaining
                    </span>
                </div>
            )}
        </div>
    ) : null;

    return (
        <ConfigProvider theme={{
            token: {
                borderRadiusLG: 16,
                colorBgElevated: '#fffdf9', // Rich Warm Paper
                boxShadowSecondary: '0 25px 60px -12px rgba(45, 25, 0, 0.15), 0 0 1px rgba(0, 0, 0, 0.1)'
            },
            components: {
                Popover: {
                    padding: 0
                }
            }
        }}>
            <Popover
                open={open && hasData && !!rect}
                content={content}
                placement="top"
                overlayClassName="memory-spirit-popover"
                trigger={[]}
            >
                {/* Virtual Anchor */}
                <div
                    style={{
                        position: 'fixed',
                        top: rect?.top ?? -2000,
                        left: rect?.left ?? -2000,
                        width: rect?.width ?? 0,
                        height: rect?.height ?? 0,
                        pointerEvents: 'none',
                        zIndex: 2000
                    }}
                />
            </Popover>
            <style>{`
                .memory-spirit-popover { z-index: 3000 !important; }
                .memory-spirit-popover .ant-popover-inner { 
                    padding: 0; 
                    border: 1px solid #efe8d8; /* Bone/Parchment border */
                    overflow: hidden;
                }
                .memory-spirit-popover .ant-popover-arrow::before { background: #fffdf9 !important; }
            `}</style>
        </ConfigProvider>
    );
}
