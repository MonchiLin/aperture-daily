import React, { useEffect, useRef } from 'react';
import type { AudioSegment } from '../lib/articles/types';
import { setHoveredSentence } from '../lib/store/interactionStore';

interface AudioPlaylistProps {
    playlist: AudioSegment[];
    currentIndex: number;
    isExpanded: boolean;
    onJump: (index: number) => void;
}

/**
 * AudioPlaylist
 * 
 * Handles the visual rendering of the audio transcript.
 * Responsibilities:
 * 1. Grouping segments into paragraphs.
 * 2. Rendering the list with visual separators.
 * 3. Handling auto-scroll to the active sentence.
 * 4. Dispatching hover events for cross-component sync.
 */
export const AudioPlaylist: React.FC<AudioPlaylistProps> = ({
    playlist,
    currentIndex,
    isExpanded,
    onJump
}) => {
    const activeLineRef = useRef<HTMLDivElement>(null);

    // 1. Grouping Logic (Direct calculation as requested)
    const blocks: AudioSegment[][] = [];
    let currentBlock: AudioSegment[] = [];

    playlist.forEach((item, i) => {
        if (item.isNewParagraph && currentBlock.length > 0) {
            blocks.push(currentBlock);
            currentBlock = [];
        }
        // Retain original index for playback sync
        currentBlock.push({ ...item, originalIndex: i } as any);
    });
    if (currentBlock.length > 0) blocks.push(currentBlock);

    // 2. Auto-scroll Logic
    useEffect(() => {
        if (isExpanded && activeLineRef.current) {
            // Wait for expansion animation to settle
            const timer = setTimeout(() => {
                activeLineRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [currentIndex, isExpanded]);

    return (
        <div className="flex-1 overflow-y-auto pr-1 pt-4 custom-scrollbar mask-gradient" role="list">
            <div className="space-y-2 px-1">
                {blocks.map((block, bIdx) => (
                    <div key={bIdx} className="relative" role="listitem">
                        {/* Visual Separator */}
                        {bIdx > 0 && (
                            <div className="flex items-center justify-center my-2 opacity-30" aria-hidden="true">
                                <div className="h-px bg-stone-300 w-16 rounded-full" />
                            </div>
                        )}

                        {/* Sentences */}
                        <div className="text-xs leading-relaxed text-stone-600">
                            {block.map((seg: any) => {
                                const isActive = seg.originalIndex === currentIndex;
                                return (
                                    <div
                                        key={seg.originalIndex}
                                        ref={isActive ? activeLineRef : null}
                                        onClick={() => onJump(seg.originalIndex)}
                                        onMouseEnter={() => {
                                            setHoveredSentence(seg.originalIndex);
                                        }}
                                        onMouseLeave={() => {
                                            setHoveredSentence(null);
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
                ))}
            </div>

            {/* Scoped Styles for Scrollbar */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #e7e5e4;
                    border-radius: 20px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: #d6d3d1;
                }
                .mask-gradient {
                    mask-image: linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%);
                }
            `}</style>
        </div>
    );
};
