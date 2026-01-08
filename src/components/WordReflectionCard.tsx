import { useStore } from '@nanostores/react';
import { interactionStore, setActiveWord } from '../lib/store/interactionStore';
import { audioState } from '../lib/store/audioStore';
import { useEffect, useState } from 'react';
import { EdgeTTSClient } from '../lib/features/audio/edge-client';

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
    const { voice } = useStore(audioState);
    const [mounted, setMounted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const lowercaseWord = word.toLowerCase();
    // During SSR and first client pass, keep it inactive to match.
    const isActive = mounted && activeWord === lowercaseWord;

    const handleMouseEnter = () => setActiveWord(lowercaseWord);
    const handleMouseLeave = () => setActiveWord(null);

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isPlaying) return;

        try {
            setIsPlaying(true);
            await EdgeTTSClient.play(word, voice);
        } catch (error) {
            console.error("TTS Playback failed:", error);
        } finally {
            setIsPlaying(false);
        }
    };

    return (
        <div
            className={`group pb-4 border-l-2 border-b border-stone-100 last:border-b-0 last:pb-0 cursor-pointer -mx-2 px-3 pt-1.5 pb-4.5 transition-all duration-300 ${isActive
                ? 'border-l-stone-500 bg-gradient-to-r from-stone-100/60 to-transparent'
                : 'border-l-transparent hover:border-l-stone-200 hover:bg-stone-50/30'
                }`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            data-word-card={lowercaseWord}
            role="button"
            aria-label={`Listen to pronunciation of ${word}`}
        >
            <div className="flex items-baseline gap-2 mb-1.5">
                <span className={`font-serif text-lg font-bold transition-colors duration-300 ${isActive ? 'text-slate-900' : 'text-slate-700'
                    } ${isPlaying ? 'text-amber-600' : ''}`}>
                    {word}
                </span>
                {phonetic && (
                    <span className="text-[11px] text-stone-400 font-mono tracking-tight">
                        {phonetic}
                    </span>
                )}
                {isPlaying && (
                    <span className="animate-pulse text-amber-500">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10 3a.75.75 0 00-.59.34l-4.552 6.13H2.75a.75.75 0 00-.75.75v3.53a.75.75 0 00.75.75h2.108l4.551 6.13A.75.75 0 0010 20V3z" />
                            <path d="M13.53 6.47a.75.75 0 00-1.06 1.06 4 4 0 010 5.66.75.75 0 001.06 1.06 5.5 5.5 0 000-7.78z" />
                        </svg>
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
