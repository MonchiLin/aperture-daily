/**
 * Historical Echoes - The Memory Spirit
 * 
 * Replaces MemorySpirit.tsx and HighlightManager.tsx.
 * Features:
 * - Hybrid Architecture (Event Delegation + Nanostores)
 * - Framer Motion for entrance/exit animations
 * - Floating UI for smart positioning (auto flip/shift)
 * - Portal-based rendering
 * 
 * Refactored: 2026-01-23
 * - Extracted subcomponents to echoes/ directory
 * - Replaced window events with nanostores
 * - Removed AntD Popover, using Floating UI instead
 * - Added type safety (removed all `any`)
 */
import { useEffect, useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react-dom';
import {
    interactionStore,
    activeInteraction,
    popoverHoverState
} from '../lib/store/interactionStore';
import { useArticleMetadata } from '../lib/hooks/useArticleMetadata';
import { PopoverContent } from './echoes';
import type { EchoItemType } from './echoes';

// --- Main Component ---

interface HistoricalEchoesProps {
    showDefinition?: boolean;
    articleId?: string;
}

export default function HistoricalEchoes({ showDefinition = false, articleId }: HistoricalEchoesProps) {
    // 0. Debug Logging (Silent)
    useArticleMetadata(articleId);

    // 1. Subscribe to Store (Source of Truth)
    const interaction = useStore(activeInteraction);
    const { echoData, definition } = useStore(interactionStore);

    // 2. Client-side only
    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true); }, []);

    // 3. Virtual reference element for Floating UI
    const virtualRef = useRef<{
        getBoundingClientRect: () => DOMRect;
    } | null>(null);

    // 4. Floating UI setup with auto-positioning
    const { refs, floatingStyles } = useFloating({
        placement: 'bottom',
        middleware: [
            offset(8),              // 8px gap between word and popover
            flip({ padding: 16 }),  // Flip to top if not enough space below
            shift({ padding: 16 })  // Keep within viewport horizontally
        ],
        whileElementsMounted: autoUpdate,  // Auto-update on scroll/resize
    });

    // 5. Update virtual reference when interaction changes
    useEffect(() => {
        const rect = interaction?.current?.rect;
        if (rect) {
            virtualRef.current = {
                getBoundingClientRect: () => new DOMRect(rect.left, rect.top, rect.width, rect.height)
            };
            refs.setReference(virtualRef.current);
        }
    }, [interaction?.current?.rect, refs]);

    if (!isClient) return null;

    // 6. Convert echoData to typed array
    const echoes: EchoItemType[] = echoData?.map(e => ({
        snippet: e.snippet,
        articleTitle: e.articleTitle,
        articleId: e.articleId,
        articleSlug: undefined,
        date: e.date,
        timeAgo: e.timeAgo,
    })) ?? [];

    // 7. Check if we have valid data in the store
    const hasEchoes = echoes.length > 0;
    const hasDefinition = showDefinition && !!definition;
    const isActive = !!interaction?.current && (hasEchoes || hasDefinition);

    // 8. Event handlers using nanostores
    const handleMouseEnter = () => popoverHoverState.set(true);
    const handleMouseLeave = () => popoverHoverState.set(false);

    // 9. Render Portal with AnimatePresence for exit animations
    return createPortal(
        <AnimatePresence>
            {isActive && (
                <div
                    key="historical-echoes-popover"
                    ref={refs.setFloating}
                    style={{
                        ...floatingStyles,
                        zIndex: 9999,
                        pointerEvents: 'auto',
                    }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    className="pt-2"
                >
                    <PopoverContent
                        definition={definition}
                        echoes={echoes}
                        showDefinition={showDefinition}
                    />
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
