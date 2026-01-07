import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface PlaybackSpeedControlProps {
    currentSpeed: number;
    onSpeedChange: (speed: number) => void;
    className?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const PlaybackSpeedControl: React.FC<PlaybackSpeedControlProps> = ({
    currentSpeed,
    onSpeedChange,
    className = ""
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOpen = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent parent clicks (important for embedding in players)
        setIsOpen(!isOpen);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                onClick={toggleOpen}
                className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200
                    ${isOpen
                        ? 'bg-stone-100 text-stone-900'
                        : 'bg-transparent text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                    }
                `}
            >
                <span>{currentSpeed}x</span>
                <svg
                    width="10" height="10" viewBox="0 0 10 10"
                    className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                >
                    <path d="M2.5 3.5L5 6L7.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 2 }}
                        animate={{ opacity: 1, scale: 1, y: 8 }}
                        exit={{ opacity: 0, scale: 0.95, y: 2 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute right-0 top-full min-w-[120px] bg-white rounded-2xl shadow-[0_4px_20px_-2px_rgba(0,0,0,0.1)] border border-stone-100 overflow-hidden z-50 p-1.5"
                    >
                        <div className="flex flex-col gap-0.5">
                            {SPEEDS.map((speed) => (
                                <button
                                    key={speed}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSpeedChange(speed);
                                        setIsOpen(false);
                                    }}
                                    className={`
                                        text-xs text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between
                                        ${currentSpeed === speed
                                            ? 'bg-stone-50 text-emerald-600 font-bold'
                                            : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
                                        }
                                    `}
                                >
                                    <span>{speed}x</span>
                                    {currentSpeed === speed && (
                                        <motion.svg
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            layoutId="active-check"
                                            width="12" height="12" viewBox="0 0 12 12" fill="none"
                                        >
                                            <path d="M2.5 6L4.5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </motion.svg>
                                    )}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
