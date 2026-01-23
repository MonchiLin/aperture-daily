/**
 * EchoItem - 单条历史回响组件
 */
import type { EchoItem as EchoItemType } from './types';

interface EchoItemProps {
    echo: EchoItemType;
    index: number;
}

export function EchoItem({ echo, index }: EchoItemProps) {
    return (
        <div className={index > 0 ? "pt-5 border-t border-stone-200/60" : ""}>
            {/* Quote */}
            <div className="relative mb-3.5">
                <span className="absolute -left-4 top-0 text-3xl font-serif text-amber-200/50 leading-none">"</span>
                <div className="text-[16px] font-serif leading-[1.6] text-stone-900 italic font-medium selection:bg-amber-100">
                    {echo.snippet}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-end justify-between gap-6">
                <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-0.5">Source</div>
                    <div className="text-[12px] font-semibold text-stone-700 leading-snug underline decoration-stone-200 decoration-2 underline-offset-4 line-clamp-2">
                        {echo.articleTitle}
                    </div>
                </div>

                <a
                    href={`/${echo.date}/${echo.articleSlug || echo.articleTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    className="group flex items-center gap-1.5 shrink-0 px-3 py-1.5 bg-stone-50 hover:bg-amber-50 rounded-full border border-stone-200/60 hover:border-amber-200 transition-all duration-300"
                >
                    <span className="text-[10px] font-black text-stone-600 group-hover:text-amber-700 uppercase tracking-tight">
                        {index === 0 ? "Revisit" : "View"}
                    </span>
                    <span className="text-xs text-stone-400 group-hover:text-amber-500 transform transition-transform group-hover:translate-x-0.5">→</span>
                </a>
            </div>
        </div>
    );
}
