import { FileDown, Play, Minus, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';

type AdminActionsProps = {
    loading: boolean;
    onFetchWords: () => void;
    onGenerate: (count: number) => void;
    onImpression?: () => void;
};

export default function AdminActions({ loading, onFetchWords, onGenerate, onImpression }: AdminActionsProps) {
    const [generateCount, setGenerateCount] = useState(5);

    const decrement = (e: React.MouseEvent) => {
        e.stopPropagation();
        setGenerateCount(prev => Math.max(1, prev - 1));
    };

    const increment = (e: React.MouseEvent) => {
        e.stopPropagation();
        setGenerateCount(prev => Math.min(20, prev + 1));
    };

    return (
        <div className="grid grid-cols-3 gap-3">
            <button
                onClick={onFetchWords}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-600 bg-white border border-stone-300 hover:border-stone-900 hover:text-stone-900 hover:bg-stone-50 transition-all disabled:opacity-50"
            >
                <FileDown size={14} />
                Fetch Words
            </button>
            <div
                className="flex items-center overflow-hidden bg-white border border-stone-300 rounded-sm hover:border-orange-600 transition-all group"
            >
                <button
                    onClick={() => onGenerate(generateCount)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-600 hover:text-orange-700 hover:bg-orange-50 transition-all disabled:opacity-50 border-r border-stone-100"
                >
                    <Play size={14} className="text-orange-600 fill-orange-600" />
                    Generate
                </button>
                <div
                    className="flex items-center px-1 bg-stone-50/50 select-none"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={decrement}
                        disabled={loading}
                        className="w-6 h-8 flex items-center justify-center hover:bg-orange-100 text-stone-400 hover:text-orange-600 transition-colors disabled:opacity-30"
                    >
                        <Minus size={12} />
                    </button>
                    <span className="w-6 text-center font-mono text-xs font-bold text-orange-700">{generateCount}</span>
                    <button
                        onClick={increment}
                        disabled={loading}
                        className="w-6 h-8 flex items-center justify-center hover:bg-orange-100 text-stone-400 hover:text-orange-600 transition-colors disabled:opacity-30"
                    >
                        <Plus size={12} />
                    </button>
                </div>
            </div>
            {onImpression && (
                <button
                    onClick={onImpression}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-600 bg-white border border-stone-300 hover:border-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition-all disabled:opacity-50"
                >
                    <Sparkles size={14} className="text-indigo-500" />
                    Impression
                </button>
            )}
        </div>
    );
}
