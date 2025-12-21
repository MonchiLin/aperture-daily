import { SoundOutlined } from '@ant-design/icons';
import { useStore } from '@nanostores/react';
import { highlightedWordId, setHighlightedWord } from '../lib/store/wordHighlight';

export type WordDefinition = {
    word: string;
    phonetic: string;
    definitions: { pos: string; definition: string }[];
};

export type WordInfo = WordDefinition & {
    masteryStatus: 'unknown' | 'familiar' | 'mastered';
};

function speak(text: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent triggering word selection
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
}

function WordCard({ wordInfo }: { wordInfo: WordInfo }) {
    const activeId = useStore(highlightedWordId);
    const isActive = activeId?.toLowerCase() === wordInfo.word.toLowerCase();

    return (
        <div
            className={`group relative rounded-xl p-4 transition-all duration-300 cursor-pointer overflow-hidden ${isActive
                ? 'bg-white/80 backdrop-blur-md shadow-lg ring-1 ring-orange-400/30'
                : 'bg-white/40 backdrop-blur-sm hover:bg-white/60 hover:shadow-md border border-white/20'
                }`}
            onClick={() => setHighlightedWord(wordInfo.word)}
        >
            {/* Active Glow Effect */}
            {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-orange-100/30 to-transparent opacity-50 pointer-events-none" />
            )}

            <div className="relative flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                        <div className={`text-lg font-bold tracking-tight ${isActive ? 'text-orange-600' : 'text-stone-800'}`}>
                            {wordInfo.word}
                        </div>
                        {wordInfo.phonetic && (
                            <div className="text-xs font-mono text-stone-500 opacity-80">{wordInfo.phonetic}</div>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        {wordInfo.definitions.map((def, i) => (
                            <div key={i} className="text-sm leading-snug line-clamp-2 text-stone-600">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-100/80 text-stone-500 mr-2 uppercase tracking-wide">
                                    {def.pos}
                                </span>
                                {def.definition}
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    className={`w-8 h-8 flex items-center justify-center rounded-full transition-all shrink-0 ${isActive
                        ? 'bg-orange-100 text-orange-600'
                        : 'bg-white/50 text-stone-400 hover:bg-white hover:text-stone-600 hover:shadow-sm'}`}
                    title="Pronounce"
                    onClick={(e) => speak(wordInfo.word, e)}
                >
                    <SoundOutlined className="text-sm" />
                </button>
            </div>
        </div>
    );
}

export function WordSidebar({ words }: { words: WordInfo[] }) {
    if (!words || words.length === 0) return null;

    return (
        <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-widest text-stone-400/80 px-2 mb-2">
                Vocabulary
            </div>
            <div className="grid grid-cols-1 gap-3">
                {words.map((w) => (
                    <WordCard key={w.word} wordInfo={w} />
                ))}
            </div>
        </div>
    );
}

export default WordSidebar;
