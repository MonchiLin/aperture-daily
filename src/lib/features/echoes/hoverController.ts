/**
 * Historical Echoes - Hover Controller
 * 
 * Implements Event Delegation for O(1) performance.
 * Instead of 2000 listeners, we use one on the container.
 */
import { setInteraction, clearInteraction } from "../../store/interactionStore";

export type InteractionMode = 'hover' | 'click';

export function initInteractionController(mode: InteractionMode = 'hover') {
    // 1. Find the article container
    const container = document.querySelector('article') || document.body;
    let hoverTimer: any = null;
    let isHoveringPopup = false;

    // Helper: Clean up interaction
    const closePopup = () => {
        // Give a small grace period for moving mouse from word to popup (only for hover mode)
        if (mode === 'hover') {
            hoverTimer = setTimeout(() => {
                if (!isHoveringPopup) {
                    clearInteraction();
                }
            }, 150);
        } else {
            clearInteraction();
        }
    };

    // Helper: Trigger interaction
    const triggerInteraction = (target: HTMLElement) => {
        const wordEl = target.closest('.target-word');
        if (wordEl) {
            if (hoverTimer) clearTimeout(hoverTimer);

            const word = wordEl.getAttribute('data-word');
            if (word) {
                const rect = wordEl.getBoundingClientRect();
                setInteraction(word, {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                });
            }
            return true;
        }
        return false;
    };

    if (mode === 'hover') {
        // --- HOVER MODE (Default) ---
        container.addEventListener('mouseover', (e) => triggerInteraction(e.target as HTMLElement));

        container.addEventListener('mouseout', (e) => {
            if ((e.target as HTMLElement).closest('.target-word')) {
                closePopup();
            }
        });

        // Handle Popup Hover (Prevent closing when moving to popup)
        window.addEventListener('historical-popup-enter', () => {
            isHoveringPopup = true;
            if (hoverTimer) clearTimeout(hoverTimer);
        });

        window.addEventListener('historical-popup-leave', () => {
            isHoveringPopup = false;
            closePopup();
        });

    } else {
        // --- CLICK MODE (Impression) ---
        // Toggle on click
        container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            // If clicked on a word, toggle it
            if (triggerInteraction(target)) {
                e.stopPropagation(); // Prevent document click from closing it immediately
            }
        });

        // Close when clicking empty space
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            // Ignore clicks inside the popup (handled by popup itself usually, but safe to check)
            if (!target.closest('[data-popover-content]') && !target.closest('.target-word')) {
                clearInteraction();
            }
        });

        // Also close on scroll to prevent misalignment
        window.addEventListener('scroll', () => {
            clearInteraction();
        }, { passive: true });
    }
}

// Alias for backward compatibility if needed, or update callers
export const initHoverController = () => initInteractionController('hover');
