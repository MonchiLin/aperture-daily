import React from 'react';
import { motion } from 'framer-motion';

interface VinylRecordProps {
    isPlaying: boolean;
    rate?: number;
    className?: string; // e.g. "w-32 h-32"
    onToggle?: (e: React.MouseEvent) => void;
    showTonearm?: boolean;
    tonearmScale?: number;
}

/**
 * TONEARM (High Fidelity SVG)
 * A realistic S-shaped tonearm with counterweight, pivots, and headshell.
 */
const TonearmSVG = ({ isPlaying, scale = 1 }: { isPlaying: boolean; scale?: number }) => {
    // Rotation transition for the entire arm assembly around the pivot
    const rotationVariants = {
        paused: { rotate: 0 },
        playing: { rotate: 28 } // Rotates inwards to play
    };

    return (
        <motion.div
            className="absolute z-40 pointer-events-none"
            style={{
                top: '-15%',    // Anchored relative to the top-right of the record container
                right: '-12%',
                width: '60%',   // Relative size to the record container
                height: '100%',
                transformOrigin: '76% 16%', // The pivot point within the SVG coordinate space
                transform: `scale(${scale})`
            }}
            initial="paused"
            animate={isPlaying ? "playing" : "paused"}
            variants={rotationVariants}
            transition={{ type: "spring", stiffness: 50, damping: 12, mass: 1.2 }}
        >
            <svg viewBox="0 0 100 160" className="w-full h-full drop-shadow-xl overflow-visible">
                {/* DEFINITIONS for gradients/filters */}
                <defs>
                    <linearGradient id="armMeta" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#d6d3d1" /> {/* stone-300 */}
                        <stop offset="50%" stopColor="#f5f5f4" /> {/* stone-100 highlight */}
                        <stop offset="100%" stopColor="#a8a29e" /> {/* stone-400 shadow */}
                    </linearGradient>
                    <linearGradient id="counterWeight" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#57534e" /> {/* stone-600 */}
                        <stop offset="100%" stopColor="#292524" /> {/* stone-800 */}
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="1" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>

                {/* 1. PIVOT BASE ASSEMBLY (Static relative to arm rotation? No, base is static, gimble rotates. 
                     Checking motion.div - the whole SVG rotates. 
                     Wait, the base should NOT rotate. The arm rotates ON the base.
                     Correction: Ideally, the base is outside the motion div.
                     However, for simplicity in this component, we can draw the base separately or keep it simple.
                     Let's rotate the WHOLE thing for now as if the pivot is the bearing center.
                     Actually, a real tonearm base is fixed. The Gimbal rotates.
                     I will put the Base Circle *outside* the rotating group if I could, but here I am rotating the whole div.
                     Better approach: Include the Arm in a Group <g> and animate THAT.
                */}

                {/* 2. THE ARM TUBE (S-Shape) */}
                {/* Path coordinates refined for a generic S-arm */}
                {/* Start near counterweight (top right), curve down and left to headshell */}
                <path
                    d="M 76 16 
                       L 72 24 
                       Q 68 32 60 50 
                       T 55 100 
                       L 55 120" // Straight end to headshell
                    fill="none"
                    stroke="url(#armMeta)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="drop-shadow-sm"
                />

                {/* 3. COUNTERWEIGHT (Rear) */}
                {/* A cylinder at the back */}
                <rect x="70" y="4" width="12" height="14" rx="2" fill="url(#counterWeight)" transform="rotate(-15 76 16)" />
                <rect x="70" y="4" width="12" height="14" rx="2" fill="black" opacity="0.2" transform="rotate(-15 76 16)" /> {/* Shader */}

                {/* 4. GIMBAL / BEARING HOUSING (Center of Rotation) */}
                <circle cx="76" cy="16" r="6.5" fill="#e7e5e4" stroke="#a8a29e" strokeWidth="1" />
                <circle cx="76" cy="16" r="2" fill="#44403c" /> {/* Screw */}

                {/* 5. HEADSHELL (Front) */}
                {/* Angled rectangle holding the cartridge */}
                <g transform="translate(53, 120) rotate(25)">
                    <path d="M -4 0 L 4 0 L 3 14 L -3 14 Z" fill="#292524" stroke="#57534e" strokeWidth="0.5" />
                    {/* Finger Lift */}
                    <path d="M 4 2 Q 8 2 9 -4" fill="none" stroke="#d6d3d1" strokeWidth="1" strokeLinecap="round" />
                    {/* Cartridge */}
                    <rect x="-2" y="14" width="4" height="3" fill="#ef4444" />
                </g>
            </svg>
        </motion.div>
    );
};


/**
 * VINYL RECORD COMPONENT
 * Unified component with Sheen, Texture, and optional Tonearm.
 */
export const VinylRecord: React.FC<VinylRecordProps> = ({
    isPlaying,
    rate = 1,
    className = "w-32 h-32",
    onToggle,
    showTonearm = true,
    tonearmScale = 1.0
}) => {

    return (
        <div className={`relative shrink-0 select-none ${className} group`}>

            {/* TONEARM - Layered ABOVE the record */}
            {showTonearm && (
                <TonearmSVG isPlaying={isPlaying} scale={tonearmScale} />
            )}

            {/* ROTATING DISC CONTAINER */}
            <div
                onClick={onToggle}
                className={`w-full h-full rounded-full bg-stone-900 shadow-2xl border-2 border-stone-800 flex items-center justify-center relative overflow-hidden active:scale-95 transition-transform cursor-pointer ring-1 ring-white/10`}
            >
                {/* 1. BASE GROOVES (Spinning) */}
                <div
                    className="w-full h-full absolute inset-0 rounded-full"
                    style={{
                        // Fine repeating radial gradient for realistic groove texture
                        background: 'repeating-radial-gradient(circle, #1c1917, #1c1917 1px, #292524 1.5px, #1c1917 2px)',
                        animation: 'spin 4s linear infinite',
                        animationPlayState: isPlaying ? 'running' : 'paused',
                        animationDuration: `${4 / rate}s`
                    }}
                />

                {/* 2. ANISOTROPIC SHEEN (Static) */}
                {/* This simulates the light reflecting off the grooves. It MUST be static while the record spins. */}
                <div
                    className="absolute inset-0 rounded-full opacity-50 pointer-events-none mix-blend-overlay"
                    style={{
                        background: 'conic-gradient(from 55deg, transparent 0deg, rgba(255,255,255,0.05) 50deg, rgba(255,255,255,0.6) 65deg, rgba(255,255,255,0.05) 80deg, transparent 120deg, transparent 230deg, rgba(255,255,255,0.05) 240deg, rgba(255,255,255,0.6) 255deg, rgba(255,255,255,0.05) 270deg, transparent 360deg)'
                    }}
                />

                {/* 3. CENTER LABEL (Spinning) */}
                <div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    style={{
                        animation: 'spin 4s linear infinite',
                        animationPlayState: isPlaying ? 'running' : 'paused',
                        animationDuration: `${4 / rate}s`
                    }}
                >
                    <div className={`rounded-full bg-orange-600 border-[3px] border-stone-300 shadow-inner flex items-center justify-center relative overflow-hidden`} style={{ width: '42%', height: '42%' }}>
                        {/* Label Decoration */}
                        <div className="absolute top-0 bottom-0 w-[1px] bg-black/10" />
                        <div className="absolute left-0 right-0 h-[1px] bg-black/10" />
                        <div className="absolute inset-0 rounded-full border-[6px] border-black/10" />
                        <div className="z-10 text-[5px] text-orange-900/60 font-black tracking-widest uppercase text-center leading-tight">
                            UpWord<br /><span className="text-[4px] font-normal">Stereo</span>
                        </div>
                    </div>
                    {/* Spindle Hole */}
                    <div className="absolute w-1.5 h-1.5 bg-black rounded-full z-20" />
                </div>
            </div>

            <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
    );
};
