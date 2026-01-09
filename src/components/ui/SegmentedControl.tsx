import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export interface SegmentedControlOption<T> {
    id: T;
    label: string;
    icon?: React.ReactNode;
    unconfigured?: boolean;
}

interface SegmentedControlProps<T> {
    value: T;
    onChange: (value: T) => void;
    options: SegmentedControlOption<T>[];
    className?: string;
    layoutId?: string;
}

/**
 * SegmentedControl - Premium "Paper Tactile" style indicator.
 */
export default function SegmentedControl<T extends string | number>({
    value,
    onChange,
    options,
    className,
    layoutId = "paper-pill"
}: SegmentedControlProps<T>) {
    return (
        <div className={clsx(
            "inline-flex p-1 bg-stone-100 rounded-xl shadow-inner border border-stone-200/50",
            className
        )}>
            {options.map((opt) => (
                <button
                    key={opt.id}
                    type="button"
                    onClick={() => !opt.unconfigured && onChange(opt.id)}
                    className={clsx(
                        "relative px-4 py-2 text-xs font-bold tracking-wider uppercase transition-all z-10",
                        value === opt.id ? "text-stone-900" : "text-stone-400 hover:text-stone-600",
                        opt.unconfigured && "cursor-not-allowed opacity-60"
                    )}
                >
                    <span className="relative z-20 flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                            {opt.icon}
                            {opt.label}
                        </div>
                        {opt.unconfigured && (
                            <span className="text-[8px] font-serif italic normal-case tracking-tight text-red-400/80 -mt-0.5">
                                Unconfigured
                            </span>
                        )}
                    </span>
                    {value === opt.id && !opt.unconfigured && (
                        <motion.div
                            layoutId={layoutId}
                            className="absolute inset-0 bg-white rounded-lg shadow-sm border border-stone-200/50"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                        />
                    )}
                    {opt.unconfigured && (
                        <div className="absolute inset-0 border border-dashed border-stone-300 rounded-lg pointer-events-none" />
                    )}
                </button>
            ))}
        </div>
    );
}
