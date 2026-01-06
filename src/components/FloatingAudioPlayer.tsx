import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

import { VinylRecord } from './VinylRecord';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import type { AudioSegment } from '../lib/articles/types';

/**
 * FloatingAudioPlayer Component
 * 
 * A high-fidelity, interactive audio player that floats in the bottom-right corner.
 * Features:
 * - Collapsible "Pill" design with expanded "Card" view
 * - Realistic Vinyl Record animation with S-shaped Tonearm
 * - Sentence-level granularity for playback and highlighting
 * - "Stream Flow" layout with vertical sentence blocks and visual separators
 */
const FloatingAudioPlayer: React.FC = () => {
    // UI State: Expanded vs Collapsed (Pill)
    const [expanded, setExpanded] = useState(false);

    // Global Audio State Hook (manages TTS, playback, playlist)
    const {
        state,
        togglePlay,
        nextSpeed,
        audioRef,
        onTimeUpdate,
        onEnded,
        jumpToSentence
    } = useAudioPlayer();

    const { isPlaying, playbackRate, playlist, currentIndex } = state;

    // Local State: Playback Progress (0-100%) for the bottom bar
    const [progress, setProgress] = useState(0);

    /**
     * Handle Time Update
     * Wraps the hook's update logic to also calculate local progress bar state.
     */
    const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
        onTimeUpdate(); // Sync word highlighting

        const audio = e.currentTarget;
        if (playlist.length > 0 && audio.duration) {
            // Calculate global progress based on current time / total duration
            const globalProgress = (audio.currentTime / audio.duration) * 100;
            setProgress(globalProgress);
        }
    };

    // Effect: Auto-scroll the text container to keep the active sentence in view
    const activeLineRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (expanded && activeLineRef.current) {
            // Add a small delay to wait for the expansion animation (spring) to settle
            const timer = setTimeout(() => {
                activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [currentIndex, expanded]);

    // Render nothing if playlist is empty (no audio content)
    if (!playlist || playlist.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 font-serif" role="region" aria-label="Audio Player">
            {/* Hidden Audio Element (Logic Core) */}
            <audio
                ref={audioRef}
                onTimeUpdate={handleTimeUpdate}
                onEnded={onEnded}
                className="hidden"
            />

            {/* Main Floating Container */}
            <motion.div
                layout
                className={`bg-white shadow-xl overflow-hidden flex flex-row relative z-50 ${!expanded ? 'cursor-pointer' : ''}`}
                style={{ borderRadius: 40 }}
                // Animate dimensions between Pill (Collapsed) and Card (Expanded) modes
                animate={{
                    width: expanded ? 600 : 260,
                    height: expanded ? 320 : 80,
                    borderRadius: expanded ? 24 : 40,
                    boxShadow: expanded
                        ? "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
                        : "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"
                }}
                // Hover Effect: Subtle lift when collapsed
                whileHover={!expanded ? {
                    y: -2,
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"
                } : {}}
                transition={{ type: "spring", stiffness: 180, damping: 24 }}
                // Click Anywhere to Expand (if collapsed)
                onClick={() => !expanded && setExpanded(true)}
                role={!expanded ? "button" : undefined}
                aria-expanded={expanded}
                aria-label={!expanded ? "Expand Audio Player" : undefined}
            >
                {/* Left Control Strip (Vinyl Area) */}
                <motion.div layout className="bg-stone-50 flex flex-col items-center justify-center shrink-0 w-[90px] h-full border-r border-stone-100 relative group overflow-visible">

                    {/* Collapse Button (Visible only when Expanded) */}
                    {expanded && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute top-4 z-30"
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                                className="w-6 h-6 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-200/50 transition-colors"
                                title="Collapse"
                                aria-label="Collapse Player"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="4 14 10 14 10 20"></polyline>
                                    <polyline points="20 10 14 10 14 4"></polyline>
                                </svg>
                            </button>
                        </motion.div>
                    )}

                    {/* Vinyl + Tonearm */}
                    <div className="relative w-14 h-14 mt-2">
                        <motion.div
                            layoutId="player-vinyl-box"
                            className="relative z-20"
                        >
                            <VinylRecord
                                isPlaying={isPlaying}
                                rate={playbackRate}
                                className={expanded ? "w-16 h-16" : "w-14 h-14"}
                                showTonearm={true}
                                tonearmScale={0.55}
                                /**
                                 * Interaction Logic:
                                 * - Expanded: Toggle Play/Pause
                                 * - Collapsed:
                                 *    - Stopped: Play & Expand
                                 *    - Playing: Pause (stay collapsed)
                                 */
                                onToggle={(e) => {
                                    e.stopPropagation(); // Always stop propagation to prevent main container click
                                    if (expanded) {
                                        togglePlay();
                                    } else {
                                        // Collapsed State Logic
                                        if (!isPlaying) {
                                            // If stopped: Start Play & Expand
                                            togglePlay();
                                            setExpanded(true);
                                        } else {
                                            // If playing: Pause (stay collapsed)
                                            togglePlay();
                                        }
                                    }
                                }}
                            />
                        </motion.div>
                    </div>

                    {expanded && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="absolute bottom-6 flex flex-col items-center gap-3 w-full z-20"
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); nextSpeed(); }}
                                className="px-2 py-1 rounded-md bg-stone-200/50 hover:bg-stone-300/50 text-[10px] font-bold text-stone-600 border border-stone-300/50 transition-colors w-12 text-center select-none"
                                title="Change Playback Speed"
                                aria-label={`Playback speed: ${playbackRate}x`}
                            >
                                {playbackRate}x
                            </button>
                        </motion.div>
                    )}
                </motion.div>

                {/* Content Area (Right Side) */}
                <div className="flex-1 p-6 flex flex-col min-w-0 relative">
                    {!expanded ? (
                        /* Collapsed View */
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center h-full w-full overflow-hidden">
                            <div className="flex flex-col justify-center w-full">
                                <div className="font-bold text-sm text-stone-900 whitespace-nowrap">
                                    {isPlaying ? 'Now Playing' : 'Listen to Article'}
                                </div>
                                <div className="text-[10px] text-stone-500 mt-0.5">{isPlaying ? `${currentIndex + 1} / ${playlist.length}` : 'Tap to expand'}</div>
                            </div>
                        </motion.div>
                    ) : (
                        /* Expanded View */
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="h-full flex flex-col relative">

                            {/* Playlist / Lyrics */}
                            <div className="flex-1 overflow-y-auto pr-1 pt-4 custom-scrollbar mask-gradient" role="list">
                                <div className="space-y-6 px-1">
                                    {/* grouping logic for rendering */}
                                    {(() => {
                                        const blocks: AudioSegment[][] = [];
                                        let currentBlock: AudioSegment[] = [];

                                        playlist.forEach((item, i) => {
                                            if (item.isNewParagraph && currentBlock.length > 0) {
                                                blocks.push(currentBlock);
                                                currentBlock = [];
                                            }
                                            currentBlock.push({ ...item, originalIndex: i } as any);
                                        });
                                        if (currentBlock.length > 0) blocks.push(currentBlock);

                                        return blocks.map((block, bIdx) => (
                                            <div key={bIdx} className="relative" role="listitem">
                                                {/* Visual Separator for new paragraphs (except the very first one) */}
                                                {bIdx > 0 && (
                                                    <div className="flex items-center justify-center my-2 opacity-30" aria-hidden="true">
                                                        <div className="h-px bg-stone-300 w-16 rounded-full" />
                                                    </div>
                                                )}

                                                {/* Vertical Sentences */}
                                                <div className="text-xs leading-relaxed text-stone-600">
                                                    {block.map((seg: any) => {
                                                        const isActive = seg.originalIndex === currentIndex;
                                                        return (
                                                            <div
                                                                key={seg.originalIndex}
                                                                ref={isActive ? activeLineRef : null}
                                                                onClick={() => jumpToSentence(seg.originalIndex)}
                                                                onMouseEnter={() => {
                                                                    // Sync external hover state (e.g. main article text)
                                                                    window.dispatchEvent(new CustomEvent('sync-sentence-hover', {
                                                                        detail: { sid: seg.originalIndex, active: true }
                                                                    }));
                                                                }}
                                                                onMouseLeave={() => {
                                                                    window.dispatchEvent(new CustomEvent('sync-sentence-hover', {
                                                                        detail: { sid: seg.originalIndex, active: false }
                                                                    }));
                                                                }}
                                                                className={`
                                                            cursor-pointer transition-all duration-200 py-0.5 rounded mb-0.5 px-1
                                                            ${isActive
                                                                        ? 'bg-purple-100 text-purple-900 font-medium shadow-sm ring-1 ring-purple-200'
                                                                        : 'hover:bg-stone-50 hover:text-stone-800'
                                                                    }
                                                        `}
                                                                role="button"
                                                                aria-current={isActive ? "true" : undefined}
                                                                aria-label={`Sentence ${seg.originalIndex + 1}`}
                                                            >
                                                                {seg.text}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>

                            {/* Thin Scrollbar Styling */}
                            <style>{`
                        .custom-scrollbar::-webkit-scrollbar {
                            width: 4px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-track {
                            background: transparent;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb {
                            background-color: #e7e5e4; /* stone-200 */
                            border-radius: 20px;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                            background-color: #d6d3d1; /* stone-300 */
                        }
                        @keyframes marquee {
                            0% { transform: translateX(0); }
                            100% { transform: translateX(-100%); }
                        }
                        .group-hover\\/text\\:animate-marquee:hover {
                            animation: marquee 5s linear infinite;
                        }
                      `}</style>
                        </motion.div>)}
                </div>

                {/* Bottom Progress Bar (Read-Only) */}
                <div
                    className="absolute bottom-0 left-0 right-0 h-[3px] bg-stone-100 pointer-events-none z-50"
                    role="progressbar"
                    aria-valuenow={Math.round(progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                >
                    <div
                        className="h-full bg-orange-500 transition-all duration-300 ease-linear shadow-[0_0_8px_rgba(249,115,22,0.4)]"
                        style={{ width: `${progress}%` }}
                    />
                </div>

            </motion.div>
        </div>
    );
};

export default FloatingAudioPlayer;
