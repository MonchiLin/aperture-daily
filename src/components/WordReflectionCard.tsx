import { useStore } from '@nanostores/react';
import { interactionStore, setActiveWord } from '../lib/store/interactionStore';
import { useEffect, useState } from 'react';

interface Definition {
    pos: string;
    definition: string;
}

interface Props {
    word: string;
    phonetic: string;
    definitions: Definition[];
}

export default function WordReflectionCard({ word, phonetic, definitions }: Props) {
    const { activeWord } = useStore(interactionStore);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const lowercaseWord = word.toLowerCase();
    // During SSR and first client pass, keep it inactive to match.
    const isActive = mounted && activeWord === lowercaseWord;

    const handleMouseEnter = () => setActiveWord(lowercaseWord);
    const handleMouseLeave = () => setActiveWord(null);

    const handleClick = () => {
        const targetWords = Array.from(document.querySelectorAll('.target-word'))
            .filter(el => el.textContent?.trim().toLowerCase() === lowercaseWord);
        if (targetWords.length > 0) {
            const visible = targetWords.find(el => {
                const r = el.getBoundingClientRect();
                return r.top >= 0 && r.bottom <= window.innerHeight;
            });
            const target = visible || targetWords[0];
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <div
            className={`group pb-4 border-b border-stone-100 last:border-0 last:pb-0 cursor-pointer -mx-2 px-3 pt-1.5 pb-4.5 rounded-xl transition-all duration-500 ${isActive ? 'bg-white shadow-xl ring-1 ring-stone-100 scale-[1.02] z-10' : 'hover:bg-stone-50/50'
                }`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            data-word-card={lowercaseWord}
        >
            <div className="flex items-baseline gap-2 mb-1.5">
                <span className={`font-serif text-lg font-bold transition-colors duration-300 ${isActive ? 'text-slate-900' : 'text-slate-700'
                    }`}>
                    {word}
                </span>
                {phonetic && (
                    <span className="text-[11px] text-stone-400 font-mono tracking-tight">
                        {phonetic}
                    </span>
                )}
            </div>

            <div className="space-y-1.5 mb-2">
                {definitions.map((def, idx) => (
                    <div key={idx} className="text-[13px] leading-snug text-stone-600">
                        <span className="text-[10px] font-black uppercase text-stone-300 mr-1.5 tracking-tighter">
                            {def.pos}
                        </span>
                        {def.definition}
                    </div>
                ))}
            </div>
        </div>
    );
}
