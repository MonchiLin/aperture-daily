
import { useStore } from '@nanostores/react';
import { $activeInsight, setInsight, clearInsight } from '../../components/impression/impressionStore';
import { motion, AnimatePresence } from 'framer-motion';

// --- Components ---

const InteractiveWord = ({ word, cleanWord }: { word: string; cleanWord?: string }) => {
    const term = cleanWord || word.replace(/[^a-zA-Z]/g, "");

    // Check if we have an insight for this word
    // In a real app, this would be a lookup against a Set of available keys
    const hasInsight = ["ephemeral", "cybernetics", "serendipity", "brutalist"].includes(term.toLowerCase());

    if (!hasInsight) return <>{word} </>;

    return (
        <span
            className="cursor-help relative group inline-block"
            onMouseEnter={() => setInsight(term)}
            onMouseLeave={() => clearInsight()}
        >
            <span className="relative z-10 border-b border-dotted border-stone-400 group-hover:border-stone-900 group-hover:bg-yellow-100/50 transition-colors duration-200">
                {word}
            </span>
            {/* Minimal marker to show interactivity */}
            <span className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-stone-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
        </span>
    );
};

const StickyMeta = () => {
    return (
        <aside className="hidden lg:flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-8 text-xs font-mono text-stone-400 select-none">
            <div className="space-y-6">
                <div className="flex flex-col gap-1">
                    <span className="uppercase tracking-widest text-[10px] opacity-50">Date</span>
                    <span className="text-stone-600">OCT 12, 2024</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="uppercase tracking-widest text-[10px] opacity-50">Reading Time</span>
                    <span className="text-stone-600">5 MIN</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="uppercase tracking-widest text-[10px] opacity-50">Progress</span>
                    <div className="w-12 h-0.5 bg-stone-200 mt-1 overflow-hidden">
                        <div className="w-1/3 h-full bg-orange-600" />
                    </div>
                </div>
            </div>

            <div className="writing-vertical-lr rotate-180 opacity-20 hover:opacity-100 transition-opacity cursor-pointer">
                APERTURE DAILY / IMPRESSION MODE
            </div>
        </aside>
    );
};

const InsightLens = () => {
    const insight = useStore($activeInsight);


    return (
        <aside className="hidden lg:block h-[calc(100vh-4rem)] sticky top-8 pl-8 border-l border-stone-100">
            <div className="relative h-full flex flex-col font-mono text-sm leading-relaxed">
                <AnimatePresence mode="wait">
                    {insight ? (
                        <motion.div
                            key={insight.term}
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="space-y-6"
                        >
                            {/* Header */}
                            <div className="pb-4 border-b border-stone-100">
                                <span className="text-[10px] uppercase tracking-widest text-orange-600 mb-2 block">
                                    {insight.type}
                                </span>
                                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                                    {insight.term}
                                </h3>
                                {insight.phonetic && (
                                    <span className="text-stone-400 mt-1 block">{insight.phonetic}</span>
                                )}
                            </div>

                            {/* Body */}
                            <div className="space-y-4 text-stone-600">
                                <p>
                                    <span className="text-slate-900 font-bold">DEF:</span> {insight.definition}
                                </p>
                                {insight.etymology && (
                                    <div className="p-3 bg-stone-50 rounded-sm text-xs border border-stone-100">
                                        <span className="block text-stone-400 mb-1 uppercase text-[10px]">Etymology</span>
                                        {insight.etymology}
                                    </div>
                                )}
                                {insight.context && (
                                    <p className="border-l-2 border-orange-200 pl-3 italic text-stone-500">
                                        "{insight.context}"
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="default"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-stone-50/50 p-6 rounded-lg border border-stone-100 text-stone-400 h-full flex flex-col items-center justify-center text-center gap-4"
                        >
                            <div className="w-12 h-12 rounded-full border border-stone-200 flex items-center justify-center animate-pulse">
                                <div className="w-2 h-2 bg-stone-300 rounded-full" />
                            </div>
                            <div className="text-xs max-w-[200px]">
                                <p className="font-bold mb-1">WAITING FOR GAZE</p>
                                <p>Hover over dotted words to reveal insights.</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </aside>
    );
};

const ArticleCore = () => {
    // Determine if we should dim non-hovered text.
    // For now, let's keep it simple: strict visual isolation might be too aggressive for V1.
    // We'll trust the "InsightLens" to draw attention.

    return (
        <article className="prose prose-lg prose-slate font-serif max-w-none prose-headings:font-display prose-headings:font-bold prose-p:leading-loose text-slate-800">
            <h1 className="text-5xl mb-8 leading-[1.1]">The Architect of <InteractiveWord word="Serendipity" /></h1>

            <p className="lead text-xl text-stone-500 mb-10 font-sans border-l-4 border-black pl-6 italic">
                A brief exploration into how we design digital spaces that feel as rich and unpredictable as the physical world.
            </p>

            <p>
                In the vast, sprawling metropolis of the internet, we often find ourselves walking down the same well-lit boulevards.
                Algorithms optimize for engagement, smoothing out the rough edges of discovery until everything feels frictionless,
                predictable, and ultimately, dull. But true intellectual joy often comes from the <InteractiveWord word="ephemeral" /> moments
                of discovery.
            </p>

            <p>
                We are building a system rooted in <InteractiveWord word="cybernetics" />—not the Hollywood robot apocalypse kind,
                but the feedback loops between human intent and system response. Imagine a reading interface that watches you read,
                not to serve ads, but to unpack the density of language in real-time.
            </p>

            <hr className="my-12 border-stone-200 w-1/3 mx-auto" />

            <h2 className="text-3xl mt-12 mb-6">Return to Raw Materials</h2>

            <p>
                There is a rising trend of <InteractiveWord word="Brutalist" /> wen design web design that rejects the soft shadows and rounded corners of the last decade.
                It asks us to look at the raw materials of the web: the text, the link, the hierarchy.
                Our approach is similar but softer—we want the precision of a research tool wrapped in the warmth of old paper.
            </p>

            <p>
                When you hover over a word here, you aren't just getting a definition. You are querying a
                knowledge base that understands the article's specific context. It is a dialogue, not a monologue.
            </p>
            <p className="invisible">
                Padding to ensure scrolling feels good.
                Padding to ensure scrolling feels good.
                Padding to ensure scrolling feels good.
                Padding to ensure scrolling feels good.
                Padding to ensure scrolling feels good.
            </p>
        </article>
    );
}

export const ImpressionLayoutV1 = () => {
    return (
        <div className="min-h-screen bg-[#F9F9F8] text-[#2D2D2D] selection:bg-orange-100 selection:text-orange-900">
            {/* Top Navigation - Minimal */}
            <header className="fixed top-0 left-0 w-full h-16 bg-[#F9F9F8]/90 backdrop-blur-sm z-50 border-b border-stone-100 flex items-center justify-between px-6 lg:px-12">
                <div className="font-display font-bold text-xl tracking-tight">UpWord <span className="font-sans font-normal text-xs text-stone-400 tracking-widest ml-2 border border-stone-200 px-1 py-0.5 rounded">BETA</span></div>
                <div className="flex gap-4">
                    <button className="text-xs font-mono font-bold text-stone-400 hover:text-stone-900 uppercase tracking-widest">Index</button>
                    <button className="text-xs font-mono font-bold text-stone-400 hover:text-stone-900 uppercase tracking-widest">Library</button>
                </div>
            </header>

            {/* Main Grid */}
            <div className="pt-24 pb-20 px-6 lg:px-12 max-w-screen-2xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_350px] gap-12">
                    {/* Left: Sticky Meta */}
                    <div className="relative">
                        <StickyMeta />
                    </div>

                    {/* Center: Article */}
                    <main className="min-w-0">
                        <ArticleCore />
                    </main>

                    {/* Right: Insight Lens */}
                    <div className="relative">
                        <InsightLens />
                    </div>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-purple-600 opacity-0 transition-opacity duration-300" id="reading-progress" />
        </div>
    );
};
