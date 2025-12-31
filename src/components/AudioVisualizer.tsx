import { useMemo } from 'react';

interface AudioVisualizerProps {
    isPlaying: boolean;
    barCount?: number;
}


export default function AudioVisualizer({ isPlaying, barCount = 24 }: AudioVisualizerProps) {
    const barsData = useMemo(() => Array.from({ length: barCount }), [barCount]);

    return (
        <div className="flex items-center justify-center gap-[1px] h-6 w-full">
            {barsData.map((_, i) => (
                <div
                    key={i}
                    className={`w-[2px] bg-stone-200 rounded-full transition-all duration-300 ${isPlaying ? 'animate-audio-bar' : 'h-1'
                        }`}
                    style={{
                        height: isPlaying ? '100%' : '2px',
                        animationDelay: `${i * 0.05}s`,
                        animationDuration: `${0.5 + Math.random() * 0.5}s`
                    }}
                />
            ))}

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes audio-bar {
                    0%, 100% { height: 4px; opacity: 0.3; }
                    50% { height: 100%; opacity: 1; }
                }
                .animate-audio-bar {
                    animation: audio-bar 1s ease-in-out infinite;
                }
            `}} />
        </div>
    );
}
