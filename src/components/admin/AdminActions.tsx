import { FileDown, Play, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

type AdminActionsProps = {
    loading: boolean;
    onFetchWords: () => void;
    onGenerate: (count: number) => void;
};

export default function AdminActions({ loading, onFetchWords, onGenerate }: AdminActionsProps) {
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
        <div className="grid grid-cols-2 gap-3">
            <button
                onClick={onFetchWords}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-600 bg-white border border-stone-300 hover:border-stone-900 hover:text-stone-900 hover:bg-stone-50 transition-all disabled:opacity-50"
            >
                <FileDown size={14} />
                Fetch Words
            </button>
            <button
                onClick={() => onGenerate(generateCount)}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-600 bg-white border border-stone-300 hover:border-orange-600 hover:text-orange-700 hover:bg-orange-50 transition-all disabled:opacity-50"
            >
                <Play size={14} className="text-orange-600 fill-orange-600" />
                Generate
                <span
                    className="inline-flex items-center ml-1 text-orange-600"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={decrement}
                        className="w-5 h-5 flex items-center justify-center hover:bg-orange-100 rounded transition-colors"
                    >
                        <Minus size={10} />
                    </button>
                    <span className="w-5 text-center font-mono text-xs">{generateCount}</span>
                    <button
                        onClick={increment}
                        className="w-5 h-5 flex items-center justify-center hover:bg-orange-100 rounded transition-colors"
                    >
                        <Plus size={10} />
                    </button>
                </span>
            </button>
        </div>
    );
}
