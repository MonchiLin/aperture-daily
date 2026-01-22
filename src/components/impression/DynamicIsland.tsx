import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

// --- Types ---
export interface InsightData {
    id: string;
    term: string;
    phonetic?: string;
    type: string;
    definition: string;
    icon: React.ElementType;
    accentColor: string;
    meta?: string;
}

// --- Configuration ---
const COLLAPSED_WIDTH = 180;
const COLLAPSED_HEIGHT = 48;
const EXPANDED_WIDTH = 520;
const EXPANDED_HEIGHT = 220;

const SPRING_TRANSITION = {
    type: "spring" as const,
    stiffness: 380,
    damping: 30,
    mass: 1
};

// --- Sub-Components ---

const ExpandedContext = ({ data }: { data: InsightData }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="w-[520px] h-[220px] flex flex-col p-6 text-white box-border origin-center"
        >
            {/* Header Area */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                    <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg shrink-0 relative overflow-hidden"
                        style={{ backgroundColor: data.accentColor }}
                    >
                        <data.icon size={20} />
                    </div>
                    <div>
                        <h3 className="font-display font-bold text-2xl leading-none mb-1 text-white tracking-wide">
                            {data.term}
                        </h3>
                        <div className="flex items-center gap-2 text-white/50 text-[10px] uppercase tracking-wider font-medium">
                            <span>{data.type}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Definition Body */}
            <p className="font-serif text-[17px] leading-relaxed text-white/90 border-l-2 border-white/10 pl-4 mb-auto line-clamp-3">
                {data.definition}
            </p>

            {/* Footer / Meta */}
            <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">{data.meta}</span>
                <button className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest text-white/70 hover:text-white transition-colors px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10">
                    Details <ArrowUpRight size={10} />
                </button>
            </div>
        </motion.div>
    );
};

const CollapsedPill = () => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="w-[180px] h-[48px] flex items-center justify-center gap-3"
        >
            <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/95">Scanning</span>
        </motion.div>
    );
};

// --- Main Component ---

interface DynamicIslandProps {
    activeData: InsightData | null;
    onHoverIsland?: (isHovering: boolean) => void;
}

export const DynamicIsland = ({ activeData, onHoverIsland }: DynamicIslandProps) => {
    return (
        <div className="fixed bottom-12 left-0 w-full flex justify-center z-[100] pointer-events-none px-4">
            <motion.div
                animate={{
                    width: activeData ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
                    height: activeData ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
                    borderRadius: activeData ? 32 : 24,
                }}
                transition={SPRING_TRANSITION}
                // Allow pointer events so we can detect hover on the island itself
                onMouseEnter={() => onHoverIsland?.(true)}
                onMouseLeave={() => onHoverIsland?.(false)}
                className="pointer-events-auto bg-[#050505] shadow-[0_10px_40px_-5px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden relative box-border flex items-center justify-center"
            >
                <AnimatePresence mode="wait" initial={false}>
                    {activeData ? (
                        <ExpandedContext key="expanded" data={activeData} />
                    ) : (
                        <CollapsedPill key="collapsed" />
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
};
