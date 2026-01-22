import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import { Maximize2, Minimize2, Volume2, ArrowLeft } from 'lucide-react';

// --- Types & Data ---
// Re-defining InsightData locally for this story if needed, or using a specific one.
// But mostly we just use a local shape since V3 has unique fields 'type' as string vs union.
interface InsightData {
    term: string;
    phonetic: string;
    definition: string;
    context: string;
    type: string;
}

const INSIGHTS: Record<string, InsightData> = {
    "nocturne": {
        term: "Nocturne",
        phonetic: "/ˈnɒk.tɜːn/",
        type: "Musical Form",
        definition: "A musical composition that is inspired by, or evocative of, the night.",
        context: "The author uses this musical metaphor to suggest that the city's night soundscape is not chaotic noise, but a structured, intentional performance."
    },
    "chiaroscuro": {
        term: "Chiaroscuro",
        phonetic: "/kiˌɑː.rəˈskjʊə.rəʊ/",
        type: "Art Theory",
        definition: "The treatment of light and shade in drawing and painting.",
        context: "A direct reference to Caravaggio's paintings, emphasizing how the high-contrast street lighting creates moral ambiguity."
    },
    "luminescence": {
        term: "Luminescence",
        phonetic: "/ˌluː.mɪˈnes.əns/",
        type: "Physics",
        definition: "Emission of light by a substance not resulting from heat.",
        context: "Unlike incandescent light (burning), this cold light suggests a detachment—the city is bright but offers no warmth."
    },
    "obsidian": {
        term: "Obsidian",
        phonetic: "/əbˈsɪd.i.ən/",
        type: "Geology",
        definition: "A hard, dark, glass-like volcanic rock formed by the rapid solidification of lava.",
        context: "Describes the sky not as empty space, but as a solid, impenetrable object that reflects the city back onto itself."
    }
};

// --- Components ---

/**
 * The Insight Overlay
 * Appears fixed at the bottom right or near the text, but unobtrusively.
 */
const CinematicInsight = ({ data }: { data: InsightData }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-12 right-12 w-96 z-50 mix-blend-screen"
        >
            <div className="relative overflow-hidden rounded-sm border-l-2 border-indigo-500 bg-slate-900/80 backdrop-blur-md p-6">
                {/* Spotlight Gradient on the card itself */}
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-indigo-500/20 blur-[50px] rounded-full pointer-events-none" />

                <div className="relative z-10">
                    <div className="flex justify-between items-baseline mb-3">
                        <h3 className="font-display font-medium text-3xl text-white tracking-wide">{data.term}</h3>
                        <span className="font-mono text-xs text-indigo-300 uppercase tracking-widest">{data.type}</span>
                    </div>

                    <div className="prose prose-invert prose-sm mb-4">
                        <p className="font-serif text-slate-300 leading-relaxed text-base italic">
                            "{data.definition}"
                        </p>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <p className="font-sans text-xs text-slate-400 uppercase tracking-wide font-bold mb-1">Contextual Note</p>
                        <p className="font-sans text-sm text-slate-300 leading-relaxed">
                            {data.context}
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const InteractivePhrase = ({
    word,
    id,
    onActivate
}: {
    word: string,
    id: string,
    onActivate: (id: string | null) => void
}) => {
    return (
        <span
            className="relative inline-block cursor-none group py-1"
            onMouseEnter={() => onActivate(id)}
            onMouseLeave={() => onActivate(null)}
        >
            <span className="relative z-10 text-indigo-200 group-hover:text-white transition-colors duration-300 border-b border-indigo-500/30 group-hover:border-indigo-400 pb-0.5">
                {word}
            </span>

            {/* Ambient Glow around word */}
            <span className="absolute inset-0 bg-indigo-500/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none scale-150" />
        </span>
    );
};

export const ImpressionLayoutV3 = () => {
    const [activeInsightId, setActiveInsightId] = useState<string | null>(null);
    const [headerVisible, setHeaderVisible] = useState(true);

    // Smooth scroll progress
    const { scrollY } = useScroll();
    const opacity = useTransform(scrollY, [0, 200], [1, 0]);
    const scale = useTransform(scrollY, [0, 200], [1, 0.95]);

    // Custom Cursor
    const cursorRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (cursorRef.current) {
                cursorRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
            }
        };
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, []);

    return (
        <div className="bg-[#050505] min-h-screen text-slate-200 font-sans cursor-none selection:bg-indigo-500/30 selection:text-white overflow-x-hidden">

            {/* Cinematic Grain/Noise Overlay */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-[100]"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")` }}
            />

            {/* Custom Cursor */}
            <div ref={cursorRef} className="fixed top-0 left-0 w-4 h-4 -ml-2 -mt-2 pointer-events-none z-[110] mix-blend-difference">
                <div className={`w-full h-full rounded-full border border-white/80 transition-all duration-300 ease-out ${activeInsightId ? 'scale-[3] bg-white/20 border-transparent' : 'scale-100'}`} />
            </div>

            {/* Navigation (Fades out on Scroll) */}
            <motion.header
                style={{ opacity }}
                className="fixed top-0 w-full p-8 flex justify-between items-start z-40 pointer-events-none"
            >
                <div className="flex items-center gap-3 pointer-events-auto">
                    <button className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors group">
                        <ArrowLeft size={16} className="text-white/60 group-hover:text-white" />
                    </button>
                </div>
                <div className="text-right pointer-events-auto">
                    <span className="block text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Current Read</span>
                    <span className="block font-display text-lg tracking-wide text-white/90">Shadows & Reflections</span>
                </div>
            </motion.header>

            {/* Main Content */}
            <main className="relative max-w-4xl mx-auto px-8 pt-48 pb-48">

                {/* Title Section */}
                <motion.div
                    style={{ scale, opacity }}
                    className="mb-32 text-center"
                >
                    <span className="inline-block px-3 py-1 mb-8 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm text-[10px] tracking-widest uppercase text-indigo-300/80">
                        Visual Essay
                    </span>
                    <h1 className="text-6xl md:text-8xl font-display font-medium text-white leading-[0.9] tracking-tighter mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                        The City<br />at <span className="italic font-light text-indigo-200">Midnight</span>
                    </h1>
                </motion.div>

                {/* Article Body */}
                <article className="prose prose-xl prose-invert max-w-2xl mx-auto font-serif leading-loose text-slate-400">
                    <p className="first-letter:text-5xl first-letter:font-display first-letter:text-white first-letter:float-left first-letter:mr-4 first-letter:mt-1">
                        In the quiet hours before dawn, the city breathes a different air.
                        It is a <InteractivePhrase word="nocturne" id="nocturne" onActivate={setActiveInsightId} />,
                        composed not of notes but of distant sirens and the hum of streetlights.
                        To walk these streets is to enter a world where visibility is optional.
                    </p>

                    <p>
                        The interplay of light creates a natural <InteractivePhrase word="chiaroscuro" id="chiaroscuro" onActivate={setActiveInsightId} /> on the pavement.
                        Shadows stretch long and thin, distorted by the rough texture of the concrete.
                        It is in these high-contrast moments that we often find the most clarity, stripped of the day's gray nuance.
                    </p>

                    <div className="my-16 relative group cursor-pointer overflow-hidden rounded-lg">
                        <div className="absolute inset-0 bg-indigo-900/20 mix-blend-overlay group-hover:bg-transparent transition-colors duration-500" />
                        <img
                            src="https://images.unsplash.com/photo-1490535004195-099bc723fa1f?q=80&w=2600&auto=format&fit=crop"
                            alt="City night lights"
                            className="w-full h-auto grayscale contrast-125 group-hover:grayscale-0 transition-all duration-700 ease-in-out scale-105 group-hover:scale-100"
                        />
                        <div className="absolute bottom-4 left-4 text-[10px] tracking-widest uppercase text-white/60">
                            Fig 1. Urban Light Study
                        </div>
                    </div>

                    <p>
                        Look closely at the shop windows. There is a faint <InteractivePhrase word="luminescence" id="luminescence" onActivate={setActiveInsightId} /> emanating from the displays,
                        calling out to no one. This ghostly light serves as a reminder of commerce paused,
                        of desires indefinitely suspended in the cool night air.
                    </p>

                    <blockquote className="border-l-2 border-indigo-500/50 pl-6 italic text-white/80 my-12 text-2xl font-display">
                        "The darkness is not an absence of light, but a canvas for it."
                    </blockquote>

                    <p>
                        The sky above is not black, but <InteractivePhrase word="obsidian" id="obsidian" onActivate={setActiveInsightId} />—a
                        deep, reflective glass that seems to hold the city's dreams. We look up directly into the void,
                        and for a fleeting second, the void looks back with a thousand electric eyes.
                    </p>
                </article>

            </main>

            {/* Insight Overlay Layer */}
            <AnimatePresence>
                {activeInsightId && (
                    <CinematicInsight key={activeInsightId} data={INSIGHTS[activeInsightId]} />
                )}
            </AnimatePresence>

            {/* Ambient Lighting Footer */}
            <div className="fixed bottom-0 left-0 w-full h-32 bg-gradient-to-t from-indigo-950/20 to-transparent pointer-events-none z-0" />

        </div>
    );
};
