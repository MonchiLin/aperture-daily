/**
 * DefinitionSection - 单词定义展示组件
 */
import { Volume2 } from 'lucide-react';
import type { WordDefinitionData } from '@/lib/store/interactionStore';

interface DefinitionSectionProps {
    definition: WordDefinitionData;
}

export function DefinitionSection({ definition }: DefinitionSectionProps) {
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
                <p className="text-[16px] leading-relaxed text-stone-800 font-serif py-0.5">
                    {definition.definition}
                </p>
            )}
        </div>
    );
}
