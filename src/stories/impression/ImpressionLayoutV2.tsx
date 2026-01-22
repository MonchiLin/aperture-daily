import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $activeInsight, $isHovering, setInsight, clearInsight, type InsightData } from '../../components/impression/impressionStore';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Sparkles, X, AlignLeft, Search } from 'lucide-react';

// --- Data (Reused/Extended) ---
// Using local mock data for V2 specific structures
const MOCK_DEFINITIONS: Record<string, any> = {
    "liminal": {
        term: "Liminal",
        phonetic: "/ˈlimənl/",
        type: "adjective",
        definition: "Occupying a position at, or on both sides of, a boundary or threshold.",
        context: "In architecture, liminal spaces are the transition zones—hallways, waiting rooms—that feel unsettling yet full of potential."
    },
    "palimpsest": {
        term: "Palimpsest",
        phonetic: "/ˈpaləmˌpsest/",
        type: "noun",
        definition: "A manuscript on which later writing has been superimposed on effaced earlier writing.",
        context: "The city is a palimpsest; modern glass structures sit atop ancient stone foundations, rewriting the skyline."
    },
    "flaneur": {
        term: "Flâneur",
        phonetic: "/fläˈnər/",
        type: "noun",
        definition: "A man who saunters around observing society.",
        context: "The digital flâneur drifts through hyperlinks without destination, collecting fragments of meaning."
    },
    "gestalt": {
        term: "Gestalt",
        phonetic: "/ɡəˈSHtält/",
        type: "noun",
        definition: "An organized whole that is perceived as more than the sum of its parts.",
        context: "The UI must be understood as a gestalt—typography, motion, and code fusing into a singular experience."
    }
};

// --- Components ---

const MarginCard = ({ data, yPos, onClose }: { data: any, yPos: number, onClose: () => void }) => {
    return (
        <motion.div
            className="absolute left-0 w-full"
            style={{ top: yPos }}
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
            <div className="relative bg-white/80 backdrop-blur-md border border-stone-200 shadow-xl rounded-xl overflow-hidden group">
                {/* Decorative Visual Tether - The little triangle pointing left */}
                <div className="absolute top-6 -left-2 w-4 h-4 bg-white border-l border-b border-stone-200 transform rotate-45" />

                <div className="p-5 relative z-10">
                    <div className="flex items-baseline justify-between mb-2">
                        <h3 className="font-display font-bold text-xl text-slate-800">{data.term}</h3>
                        <span className="font-mono text-xs text-stone-400">{data.phonetic}</span>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                        <span className="px-1.5 py-0.5 rounded-md bg-stone-100 text-[10px] font-bold uppercase tracking-wider text-stone-500 border border-stone-200">
                            {data.type}
                        </span>
                    </div>

                    <p className="font-serif text-sm leading-relaxed text-stone-600 mb-4">
                        {data.definition}
                    </p>

                    <div className="pt-3 border-t border-stone-100">
                        <p className="text-xs font-mono text-stone-500 leading-relaxed opacity-80">
                            <span className="text-orange-600 font-bold mr-1">CTX ›</span>
                            {data.context}
                        </p>
                    </div>
                </div>

                {/* Card Actions (Visible on Hover) */}
                <div className="bg-stone-50 px-5 py-2 border-t border-stone-100 flex justify-between items-center">
                    <button className="text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-orange-600 transition-colors flex items-center gap-1">
                        <Sparkles size={12} /> Save
                    </button>
                    <button className="text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-slate-900 transition-colors">
                        More...
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

const InteractiveWord = ({ word, setFocus }: { word: string, setFocus: (data: any, y: number) => void }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const term = word.toLowerCase().replace(/[^a-z]/g, "");
    const hasData = !!MOCK_DEFINITIONS[term];

    if (!hasData) return <>{word} </>;

    const handleMouseEnter = () => {
        if (ref.current) {
            // Calculate Y position relative to the article container
            // This is a simplified calculation for the prototype
            // specific to the "relative" parent of the grid row
            const offsetTop = ref.current.offsetTop;
            const lineHeight = 32; // approx
            setFocus(MOCK_DEFINITIONS[term], offsetTop - 20); // Adjust to align visually
        }
    };

    return (
        <span
            ref={ref}
            className="cursor-pointer relative inline-block group"
            onMouseEnter={handleMouseEnter}
        >
            <span className="border-b-2 border-orange-200/50 group-hover:bg-orange-100/50 group-hover:border-orange-400 transition-all duration-300 rounded-sm px-0.5">
                {word}
            </span>
        </span>
    );
};

export const ImpressionLayoutV2 = () => {
    const [focusedData, setFocusedData] = useState<any>(null);
    const [focusY, setFocusY] = useState(0);

    // Auto-clear focus when scrolling far? Maybe not for now.

    return (
        <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans selection:bg-orange-200">
            {/* Nav - Floating Capsule */}
            <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
                <div className="bg-white/90 backdrop-blur-md shadow-lg rounded-full px-6 py-3 flex items-center gap-6 border border-stone-200/50">
                    <span className="font-display font-bold text-lg">UpWord</span>
                    <div className="w-px h-4 bg-stone-300" />
                    <div className="flex gap-4 text-sm font-medium text-stone-500">
                        <a href="#" className="text-slate-900">Read</a>
                        <a href="#" className="hover:text-slate-900 transition-colors">Listen</a>
                        <a href="#" className="hover:text-slate-900 transition-colors">Library</a>
                    </div>
                    <div className="pl-4 border-l border-stone-200">
                        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition-colors cursor-pointer">
                            <Search size={14} />
                        </div>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-6 pt-32 pb-40">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-16 relative">

                    {/* Main Content Column */}
                    <main className="max-w-2xl ml-auto">
                        <header className="mb-20 text-center lg:text-left">
                            <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-orange-600 uppercase mb-6">
                                <span className="w-2 h-2 rounded-full bg-orange-600"></span>
                                Philosophy of Design
                            </div>
                            <h1 className="text-5xl lg:text-7xl font-display font-black text-slate-900 leading-[1.1] mb-8 tracking-tight">
                                The Urban <br /> <InteractiveWord word="Palimpsest" setFocus={setFocusedData} />
                            </h1>
                            <div className="flex items-center gap-4 text-sm text-stone-500 font-mono border-t border-b border-stone-200 py-4">
                                <span>ISSUE 042</span>
                                <span>•</span>
                                <span>By Sarah J. Hale</span>
                                <span>•</span>
                                <span>Oct 24, 2024</span>
                            </div>
                        </header>

                        <article className="prose prose-lg prose-stone font-serif leading-loose prose-p:text-lg prose-p:text-slate-700/90 text-[19px]">
                            <p className="first-letter:text-6xl first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-10px] first-letter:font-display">
                                Cities are not written once, but rewritten endlessly. We walk through streets that are <InteractiveWord word="liminal" setFocus={setFocusedData} /> spaces,
                                suspended between what they were and what they are becoming. To understand the modern metropolis,
                                one must adopt the gaze of the <InteractiveWord word="flaneur" setFocus={setFocusedData} />—the idle observer who finds truth in the aimless drift.
                            </p>

                            <p>
                                Every building facade hides the ghost of the structure that stood there before. This layering creates a visual <InteractiveWord word="gestalt" setFocus={setFocusedData} />
                                —a complete experience that is richer, stranger, and more complex than any single architect intended.
                                The steel beam does not just support the glass; it frames the memory of the brick it replaced.
                            </p>

                            <blockquote className="border-l-4 border-orange-500 pl-6 italic font-display text-2xl text-slate-900 my-12 bg-orange-50/50 py-8 pr-4 rounded-r-lg">
                                "We shape our buildings; thereafter they shape us."
                                <footer className="text-sm font-sans not-italic text-stone-500 mt-2">— Winston Churchill</footer>
                            </blockquote>

                            <p>
                                In digital design, we often strive for a clean slate. We want to erase the past versions, the deprecated code,
                                the legacy layouts. But perhaps there is value in the accumulation of errors, in the digital rust.
                                A website that shows its age, its history, feels more alive than one that was born yesterday.
                            </p>

                            <p>
                                When we scrutinize the <InteractiveWord word="liminal" setFocus={setFocusedData} /> boundaries of our interfaces,
                                we find that users crave friction. They want to feel the grain of the paper, even if pixels have no grain.
                                They want the content to resist them slightly, to demand attention, rather than sliding past like oil on glass.
                            </p>

                            <div className="h-32"></div>
                        </article>
                    </main>

                    {/* Right Margin (The "Context" Column) */}
                    <aside className="relative hidden lg:block h-full">
                        {/* Sticky container for the margin content */}
                        <div className="sticky top-0 h-screen overflow-visible">
                            {/* This container needs to match the prose content offset ideally, or we use absolute positioning relative to row */}
                            <div className="relative h-full pt-32 w-full max-w-sm">

                                <AnimatePresence>
                                    {focusedData ? (
                                        <MarginCard
                                            key={focusedData.term}
                                            data={focusedData}
                                            yPos={focusY}
                                            onClose={() => setFocusedData(null)}
                                        />
                                    ) : (
                                        // Default "Ambient" State for the margin
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="absolute top-1/3 left-0 space-y-8 opacity-40 hover:opacity-100 transition-opacity duration-500"
                                        >
                                            <div className="border-l-2 border-stone-200 pl-4 py-1">
                                                <h4 className="font-bold text-xs uppercase tracking-widest mb-2 font-mono">Reference</h4>
                                                <p className="font-serif text-sm italic">Walter Benjamin's "The Arcades Project" is essential reading for this section.</p>
                                            </div>

                                            <div className="border-l-2 border-stone-200 pl-4 py-1">
                                                <h4 className="font-bold text-xs uppercase tracking-widest mb-2 font-mono">Audio Note</h4>
                                                <div className="flex items-center gap-2 text-sm font-bold">
                                                    <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center">
                                                        <AlignLeft size={12} />
                                                    </div>
                                                    Play Author's Commentary
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </aside>

                </div>
            </div>

            {/* Background Texture/Grain */}
            <div className="fixed inset-0 pointer-events-none opacity-40 mix-blend-multiply z-0"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}>
            </div>
        </div>
    );
};
