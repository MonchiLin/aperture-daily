import { useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { interactionStore } from '../lib/store/interactionStore';

interface Point {
    x: number;
    y: number;
}

interface TetherPath {
    path: string;
    opacity: number;
    type: 'orange' | 'gold';
}

export default function VisualTether() {
    const { activeWord, currentLevel, echoData } = useStore(interactionStore);
    const [paths, setPaths] = useState<TetherPath[]>([]);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!activeWord) {
            setPaths([]);
            return;
        }

        const updateTether = () => {
            const levelContainer = document.querySelector(`.article-level[data-level="${currentLevel}"]`);
            if (!levelContainer) return;

            const wordInstances = Array.from(levelContainer.querySelectorAll(`.target-word[data-word="${activeWord}"]`));
            if (wordInstances.length === 0) return;

            const newPaths: TetherPath[] = [];

            // 1. Dictionary Tether (Orange Line)
            // 连接文章中的单词 -> 右侧栏的字典卡片
            // 这是一个 "One-to-Many" 的连线：
            // 多个文章中的单词实例 (wordInstances) 都会连向同一个字典卡片 (card)。
            const card = document.querySelector(`[data-word-card="${activeWord}"]`);
            if (card) {
                const cardRect = card.getBoundingClientRect();
                const target: Point = {
                    x: cardRect.left,
                    y: cardRect.top + cardRect.height / 2
                };

                wordInstances.forEach((el) => {
                    const line = calculateTether(el, target, 'orange');
                    if (line) newPaths.push(line);
                });
            }

            setPaths(newPaths);
        };

        const calculateTether = (sourceEl: Element, targetPt: Point, type: 'orange' | 'gold'): TetherPath | null => {
            const rect = sourceEl.getBoundingClientRect();
            // Visibility check
            if (rect.top < -50 || rect.bottom > (window.innerHeight + 50)) return null;

            // Determine if target is to the left or right of the word
            const isTargetLeft = targetPt.x < rect.left;

            // Anchor point on the word: left or right edge
            const sourcePt: Point = {
                x: isTargetLeft ? rect.left : rect.right,
                y: rect.top + rect.height / 2
            };

            // Re-adjust target anchor if it's on the left
            // For cards on the right (dict), we use rect.left (line 40).
            // For cards on the left (memory), we should use cardRect.right.
            // But targetPt is already passed in by updateTether.
            // I'll update updateTether to pass the correct card edge.

            const dx = targetPt.x - sourcePt.x;
            const curveFactor = type === 'gold' ? 0.5 : 0.4;
            const cp1 = { x: sourcePt.x + dx * curveFactor, y: sourcePt.y };
            const cp2 = { x: targetPt.x - dx * curveFactor, y: targetPt.y };

            const d = `M ${sourcePt.x} ${sourcePt.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${targetPt.x} ${targetPt.y}`;
            return { path: d, opacity: 1, type };
        };

        // Initial draw & loop for animation frame if needed (but scroll listener is better for perf)
        updateTether();
        // Small delay for DOM layout of MemoryCard to settle (since it animates in)
        const timer = setTimeout(updateTether, 350);

        const handleScroll = () => requestAnimationFrame(updateTether);
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleScroll);
            clearTimeout(timer);
        };
    }, [activeWord, currentLevel, echoData]);

    if (paths.length === 0) return null;

    return (
        <svg
            ref={svgRef}
            className="fixed inset-0 pointer-events-none z-50 overflow-visible"
            style={{ width: '100vw', height: '100vh' }}
        >
            <style>{`
                @keyframes tether-draw {
                    from { opacity: 0; stroke-dashoffset: 1; }
                    to { opacity: 1; stroke-dashoffset: 0; }
                }
                .tether-line {
                    animation: tether-draw 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                    stroke-dasharray: 1;
                    stroke-dashoffset: 1;
                }
                .tether-gold {
                    stroke-dasharray: 4 4; /* Dashed for memory */
                    animation: tether-draw 0.8s ease-out forwards;
                }
            `}</style>
            <defs>
                <linearGradient id="tetherGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#D9480F" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#D9480F" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="memoryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#d97706" stopOpacity="0.9" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            {paths.map((p, i) => (
                <path
                    key={i}
                    d={p.path}
                    pathLength="1"
                    stroke={p.type === 'gold' ? "url(#memoryGradient)" : "url(#tetherGradient)"}
                    strokeWidth={p.type === 'gold' ? "2" : "1.5"}
                    fill="none"
                    strokeLinecap="round"
                    filter="url(#glow)"
                    className={p.type === 'gold' ? "tether-line tether-gold" : "tether-line"}
                    style={{ opacity: p.opacity }}
                />
            ))}
        </svg>
    );
}
