import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { Volume2, ArrowRight, Share2, Bookmark, ChevronLeft, Type } from 'lucide-react';

// --- Types ---
interface InsightData {
    id: string;
    term: string;
    phonetic?: string;
    pos: string;
    meaning: string;
    context?: string;
    tags?: string[];
}

// --- Data ---
const INSIGHTS: Record<string, InsightData> = {
    "interface": {
        id: "interface",
        term: "Interface",
        phonetic: "ˈin(t)ərˌfās",
        pos: "n.",
        meaning: "两个系统相互作用的边界点。在设计领域，指人与产品之间的接触面。",
        context: "Design",
        tags: ["HCI", "System"]
    },
    "friction": {
        id: "friction",
        term: "Friction",
        phonetic: "ˈfrikSH(ə)n",
        pos: "n.",
        meaning: "有意添加的阻力，用于防止用户犯错或鼓励深思熟虑的决策。",
        context: "UX",
        tags: ["Psychology", "Behavior"]
    },
    "cognitive": {
        id: "cognitive",
        term: "Cognitive Load",
        pos: "n.",
        meaning: "工作记忆中使用的心智资源总量。负荷过重会降低学习效率和任务表现。",
        context: "Psychology",
        tags: ["Memory", "Performance"]
    },
    "echo": {
        id: "echo",
        term: "echo",
        phonetic: "ˈekō",
        pos: "n.",
        meaning: "指过去事件或声音的残留、痕迹或反映。",
        context: "Literal",
        tags: ["Sound", "Memory"]
    },
    "previous": {
        id: "previous",
        term: "previous",
        phonetic: "ˈprēvēəs",
        pos: "adj.",
        meaning: "发生在较早时间或顺序上的。",
        context: "Time",
        tags: ["Order"]
    },
    "growth": {
        id: "growth",
        term: "growth",
        phonetic: "ɡrōTH",
        pos: "n.",
        meaning: "发展、增加或进步的过程。",
        context: "Abstract",
        tags: ["Progress"]
    },
    "coordinate": {
        id: "coordinate",
        term: "coordinate",
        phonetic: "kōˈôrdn-āt",
        pos: "v.",
        meaning: "有效地组织或安排（不同部分或活动）以实现和谐或协同。",
        context: "Action",
        tags: ["Teamwork"]
    },
    "accuracy": {
        id: "accuracy",
        term: "accuracy",
        phonetic: "ˈakyərəsē",
        pos: "n.",
        meaning: "准确性；精确无误的质量。",
        context: "Quality",
        tags: ["Precision"]
    },
    "stimulus": {
        id: "stimulus",
        term: "stimulus",
        phonetic: "ˈstimyələs",
        pos: "n.",
        meaning: "激励因素；促进活动、兴趣或反应增强的事物。",
        context: "Biology",
        tags: ["Reaction"]
    }
};



// --- Components ---

const EditorialCard = ({
    data,
    rect,
    onClose
}: {
    data: InsightData;
    rect: DOMRect;
    onClose: () => void;
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const centerX = rect.left + rect.width / 2;
        const y = rect.bottom + 16;
        setPos({
            x: Math.max(200, Math.min(centerX, window.innerWidth - 200)),
            y: Math.min(y, window.innerHeight - 300)
        });

        const handleClick = (e: MouseEvent) => {
            if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();

        setTimeout(() => window.addEventListener('mousedown', handleClick), 10);
        window.addEventListener('keydown', handleEsc);
        return () => {
            window.removeEventListener('mousedown', handleClick);
            window.removeEventListener('keydown', handleEsc);
        };
    }, [rect, onClose]);

    return (
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
                    boxShadow: '0 4px 20px -4px rgba(0, 0, 0, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.05)'
                }}
            >
                {/* Vintage Top Line */}
                <div className="h-1 w-full bg-[#D9480F]" />

                <div className="p-5 font-serif">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                        <div>
                            <h3 className="text-2xl font-bold text-[#1A1A1A] tracking-tight mb-1">
                                {data.term}
                            </h3>
                            <div className="flex items-center gap-2 text-[#666666]">
                                <span className="text-sm italic">{data.pos}</span>
                                <span className="text-xs font-sans">/{data.phonetic}/</span>
                            </div>
                        </div>
                        <button className="text-[#666666] hover:text-[#D9480F] transition-colors">
                            <Volume2 size={16} />
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="h-px w-12 bg-[#D9480F]/30 mb-4" />

                    {/* Definition */}
                    <p className="text-[15px] leading-relaxed text-[#2D2D2D] mb-4">
                        {data.meaning}
                    </p>

                    {/* Meta */}
                    {data.context && (
                        <div className="flex items-center gap-2 mb-4">
                            <span className="px-2 py-0.5 rounded-sm bg-[#F5F5F0] text-[#666666] text-xs uppercase tracking-wider font-sans font-bold">
                                {data.context}
                            </span>
                        </div>
                    )}

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
    );
};

const TriggerWord = ({
    children,
    id,
    isActive,
    onClick
}: {
    children: string;
    id: string;
    isActive: boolean;
    onClick: (id: string, rect: DOMRect) => void;
}) => {
    const ref = useRef<HTMLSpanElement>(null);

    return (
        <span
            ref={ref}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                ref.current && onClick(id, ref.current.getBoundingClientRect());
            }}
            className={`
                cursor-pointer transition-colors duration-200
                ${isActive ? 'text-[#D9480F]' : 'text-[#1A1A1A] hover:text-[#D9480F]'}
                border-b-[1.5px] border-dotted
                ${isActive ? 'border-[#D9480F]' : 'border-[#D9480F]/50'}
            `}
        >
            {children}
        </span>
    );
};

// --- Main Layout ---
export const ImpressionLayout = () => {
    const [active, setActive] = useState<{ id: string; rect: DOMRect } | null>(null);
    const { scrollYProgress } = useScroll();
    const headerOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1]);

    const handleClick = useCallback((id: string, rect: DOMRect) => {
        setActive(prev => prev?.id === id ? null : { id, rect });
    }, []);

    return (
        <div className="min-h-screen bg-[#F5F5F0] text-[#1A1A1A] font-serif selection:bg-[#D9480F]/20 selection:text-[#1A1A1A]">

            {/* Texture Overlay */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.4] bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] mix-blend-multiply z-0" />

            {/* Nav */}
            <motion.nav
                style={{ opacity: headerOpacity }}
                className="fixed top-0 w-full h-16 bg-[#F5F5F0]/95 backdrop-blur-sm border-b border-[#E6E6E1] z-50 flex items-center justify-between px-8"
            >
                <div className="flex items-center gap-4 font-sans">
                    <button className="hover:text-[#D9480F] transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="font-bold tracking-tight text-sm uppercase">UpWord</span>
                </div>
                <div className="flex gap-4 text-[#666666]">
                    <Type size={18} className="cursor-pointer hover:text-[#1A1A1A]" />
                    <Share2 size={18} className="cursor-pointer hover:text-[#1A1A1A]" />
                </div>
            </motion.nav>

            <main className="relative z-10 max-w-[760px] mx-auto pt-32 pb-32 px-8">

                {/* Header */}
                <header className="mb-14 border-b border-[#1A1A1A] pb-8">
                    <div className="flex items-center gap-4 mb-6 font-sans text-xs font-bold tracking-widest text-[#666666] uppercase">
                        <span>Day</span>
                        <span className="w-px h-3 bg-[#CCCCCC]" />
                        <span>Wednesday, 2026/01/21</span>
                        <span className="w-px h-3 bg-[#CCCCCC]" />
                        <span>1 Minute</span>
                        <span className="ml-auto flex gap-1">
                            <span className="bg-[#1A1A1A] text-white px-1.5 rounded-sm">L1</span>
                            <span className="text-[#999999]">L2</span>
                            <span className="text-[#999999]">L3</span>
                        </span>
                    </div>

                    <h1 className="text-5xl font-bold leading-[1.1] text-[#1A1A1A] mb-0 tracking-tight">
                        Dream and Extinction<br />Game Overview
                    </h1>
                </header>

                {/* Article */}
                <article className="text-[20px] leading-[1.7] text-[#2D2D2D]">
                    <p className="first-letter:float-left first-letter:text-[5rem] first-letter:leading-[4rem] first-letter:font-bold first-letter:mr-3 first-letter:mt-[-0.5rem] mb-6">
                        new game called "Dream and Extinction" is on Steam. You can play a free demo now.
                        You are a "lucid dreamer" in the game. You go into a pixel world. This world is not
                        good because of bad dreams. You must find clues. These clues are like an{' '}
                        <TriggerWord id="echo" isActive={active?.id === 'echo'} onClick={handleClick}>echo</TriggerWord> from the
                        past.
                    </p>

                    <p className="mb-6">
                        You follow <TriggerWord id="previous" isActive={active?.id === 'previous'} onClick={handleClick}>previous</TriggerWord> explorers' steps.
                        You get new powers and weapons. This is your <TriggerWord id="growth" isActive={active?.id === 'growth'} onClick={handleClick}>growth</TriggerWord> in
                        the game. You can use different weapons. You need to <TriggerWord id="coordinate" isActive={active?.id === 'coordinate'} onClick={handleClick}>coordinate</TriggerWord> your
                        attacks.
                    </p>

                    <p className="mb-6">
                        This helps you hit enemies with good <TriggerWord id="accuracy" isActive={active?.id === 'accuracy'} onClick={handleClick}>accuracy</TriggerWord>.
                        Big bosses are a fun <TriggerWord id="stimulus" isActive={active?.id === 'stimulus'} onClick={handleClick}>stimulus</TriggerWord>. They make
                        you want to play more and explore.
                    </p>

                    <p>
                        We live in a world of screens. The <TriggerWord id="interface" isActive={active?.id === 'interface'} onClick={handleClick}>interface</TriggerWord> is
                        the membrane through which we experience reality. It connects us, but it seems to separate us.
                        For decades, we have tried to make this membrane invisible.
                    </p>
                </article>

                {/* Footer Sources */}
                <footer className="mt-16 pt-8 border-t border-[#E6E6E1] font-sans">
                    <h4 className="text-xs font-bold tracking-widest text-[#999999] uppercase mb-4">Sources</h4>
                    <ul className="text-sm text-[#666666] space-y-1">
                        <li>• gcores.com</li>
                        <li>• store.steampowered.com</li>
                    </ul>
                </footer>
            </main>

            {/* Popover Layer */}
            <AnimatePresence>
                {active && INSIGHTS[active.id] && (
                    <EditorialCard
                        key={active.id}
                        data={INSIGHTS[active.id]}
                        rect={active.rect}
                        onClose={() => setActive(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};
