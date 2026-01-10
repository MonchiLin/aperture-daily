import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VinylRecord } from './VinylRecord';
import { useAudioPlayer } from '../lib/features/audio/useAudioPlayer';
import { AudioPlaylist } from './AudioPlaylist';
import { PlaybackSpeedControl } from './PlaybackSpeedControl';

// --- Icons ---
// --- Icons ---
const PauseIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-stone-900"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>);
const MinimizeIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg>);

/**
 * H200 AUDIO PLAYER (Explicit Geometry Engine)
 * 
 * 核心技术点：Explicit Layout Animation (显式布局动画)
 * 
 * 问题背景：
 * Framer Motion 的 `layout` 属性通常使用 CSS Transform (scale) 来模拟尺寸变化。
 * 这对于矩形很有效，但包含圆形元素 (Vinyl Record) 时会导致严重的“压扁/拉伸”变形 (Distortion)。
 * 也就是著名的 "Scale Distortion" 问题。
 * 
 * 解决方案：
 * 我们必须**禁用**父容器的 `layout` 属性。
 * 转而使用显式的 width/height/borderRadius 动画。
 *这会触发浏览器的 Layout 重排 (Reflow)，虽然性能开销略大，但对于这种复杂的几何嵌套组件，
 * 是唯一能保持子元素（尤其是正圆形的黑胶唱片）宽高比不变的方法。
 */
const FloatingAudioPlayer: React.FC = () => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Audio Hook
    const { state, togglePlay, changeSpeed, audioRef, onTimeUpdate, onEnded, jumpToSentence } = useAudioPlayer();
    const { isPlaying, playbackRate, playlist, currentIndex } = state;
    const [progress, setProgress] = useState(0);

    const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
        onTimeUpdate();
        const audio = e.currentTarget;
        if (playlist.length > 0 && audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };

    // --- PHYSICS ---
    // Softer spring to prevent "Snap" artifacts at the end of JS animation
    const SPRING_CONFIG = { type: "spring" as const, stiffness: 180, damping: 26, mass: 1 };

    if (!playlist || playlist.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 font-sans pointer-events-none">
            <audio ref={audioRef} onTimeUpdate={handleTimeUpdate} onEnded={onEnded} className="hidden" crossOrigin="anonymous" />

            {/* MAIN CONTAINER */}
            <motion.div
                // NO layout prop
                initial={false}
                animate={{
                    width: isExpanded ? 640 : 280,
                    height: isExpanded ? 360 : 72,
                    borderRadius: isExpanded ? 32 : 40,
                }}
                transition={SPRING_CONFIG}
                whileHover={{ scale: isExpanded ? 1 : 1.05 }}
                whileTap={{ scale: isExpanded ? 1 : 0.95 }}
                className={`
                    relative overflow-hidden flex flex-row z-50 pointer-events-auto origin-bottom-right
                    ${isExpanded
                        ? 'bg-white/95 backdrop-blur-2xl shadow-[0_30px_60px_-10px_rgba(0,0,0,0.12)] border border-stone-200/50'
                        : 'bg-white shadow-[0_8px_24px_rgba(0,0,0,0.1)] border border-stone-100 cursor-pointer'
                    }
                `}
                onClick={() => !isExpanded && setIsExpanded(true)}
            >

                {/* --- LEFT PANEL --- */}
                <motion.div
                    // NO layout prop
                    className="bg-stone-50/50 flex flex-col items-center justify-center shrink-0 h-full border-r border-stone-200/60 relative group overflow-hidden"
                    initial={{ width: 72 }} // Explicit initial state
                    animate={{ width: isExpanded ? 200 : 72 }}
                    transition={SPRING_CONFIG}
                >
                    {/* VINYL WRAPPER */}
                    {/* 
                      几何锚点 (Geometrical Stronghold)
                      我们强制锁定 aspect-square，并配合显式的 width/height 动画。
                      transition 使用弹簧物理 (Spring Physics)，
                      模拟真实的机械展开质感，避免由于 JS 动画帧率波动导致的“生硬感”。
                    */}
                    <motion.div
                        // NO layout prop
                        className="relative flex items-center justify-center z-20 cursor-pointer transition-transform aspect-square shrink-0 group"
                        initial={{ width: 40, height: 40 }} // Explicit initial state
                        animate={{
                            width: isExpanded ? 160 : 40,
                            height: isExpanded ? 160 : 40
                        }}
                        transition={SPRING_CONFIG}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (isExpanded) togglePlay();
                            else { if (!isPlaying) { togglePlay(); setIsExpanded(true); } else togglePlay(); }
                        }}
                    >
                        <VinylRecord
                            isPlaying={isPlaying}
                            rate={playbackRate}
                            className="w-full h-full"
                            showTonearm={true}
                        />

                        {/* Hover Overlay - Aesthetically Pleasing */}
                        <AnimatePresence>
                            {(isExpanded && isPlaying) && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    whileHover={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-30 flex items-center justify-center bg-black/10 backdrop-blur-[1px] rounded-full opacity-0 transition-opacity duration-300"
                                >
                                    <div className="bg-white/90 p-3 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300">
                                        <PauseIcon />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>

                {/* --- RIGHT PANEL --- */}
                <div className="flex-1 bg-white/40 flex flex-col min-w-0 relative">
                    {!isExpanded ? (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-center h-full w-full px-4"
                        >
                            <div className="flex flex-col justify-center">
                                <div className="font-bold text-sm text-stone-900 leading-tight">Article Player</div>
                                <div className="text-[10px] text-stone-500">Tap to expand</div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            transition={{ delay: 0.1, duration: 0.3 }}
                            className="h-full flex flex-col"
                        >
                            <div className="h-14 border-b border-stone-100 flex items-center px-6 justify-between bg-white/50 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="text-xs font-medium text-stone-500 tracking-widest uppercase">Article Player</span>
                                </div>
                                {/* Top Right Controls */}
                                <div className="flex items-center gap-1">
                                    <PlaybackSpeedControl
                                        currentSpeed={playbackRate}
                                        onSpeedChange={changeSpeed}
                                        className="w-[72px]"
                                    />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsExpanded(false); }}
                                        className="p-1.5 text-stone-400 hover:text-stone-900 transition-colors hover:bg-stone-200 rounded"
                                    >
                                        <MinimizeIcon />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto custom-scrollbar px-6">
                                <AudioPlaylist playlist={playlist} currentIndex={currentIndex} isExpanded={isExpanded} onJump={jumpToSentence} />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-stone-100">
                                <motion.div className="h-full bg-stone-800" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ type: "tween", ease: "linear", duration: 0.1 }} />
                            </div>
                        </motion.div>
                    )}
                </div>
                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-track { bg: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
                `}</style>
            </motion.div>
        </div>
    );
};

export default FloatingAudioPlayer;
