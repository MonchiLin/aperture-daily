/**
 * OverflowIndicator - 溢出指示器组件
 */

interface OverflowIndicatorProps {
    count: number;
}

export function OverflowIndicator({ count }: OverflowIndicatorProps) {
    if (count <= 3) return null;

    return (
        <div className="mt-6 pt-3.5 border-t-2 border-dotted border-stone-200 flex items-center justify-center gap-2">
            <span className="text-[10px] font-bold text-amber-600/80 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded">
                + {count - 3}
            </span>
            <span className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.2em]">
                Deep Memories Remaining
            </span>
        </div>
    );
}
