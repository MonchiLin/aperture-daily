/**
 * EchoHeader - Historical Echoes 标题组件
 */

interface EchoHeaderProps {
    date: string;
}

export function EchoHeader({ date }: EchoHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-5 leading-none">
            <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-600 ring-4 ring-amber-600/10" />
                <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-700/90 font-sans">
                    Historical Echoes
                </span>
            </div>
            <span className="text-[10px] font-mono font-medium text-stone-400/80 tracking-tighter">
                {date}
            </span>
        </div>
    );
}
