/**
 * Historical Echoes - Hover Controller
 * 
 * Implements Event Delegation for O(1) performance.
 * Instead of 2000 listeners, we use one on the container.
 */
import { setInteraction, clearInteraction } from "../../store/interactionStore";

export function initHoverController() {
    // 1. Find the article container
    const container = document.querySelector('article') || document.body;
    let hoverTimer: any = null;
    let isHoveringPopup = false;

    // Helper: Clean up old popups
    const closePopup = () => {
        // Give a small grace period for moving mouse from word to popup
        hoverTimer = setTimeout(() => {
            if (!isHoveringPopup) {
                clearInteraction();
            }
        }, 150); // 150ms grace period
    };

    // 2. Mouse Over (Enter)
    container.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
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
        }
    });

    // 3. Mouse Out (Leave)
    container.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        const wordEl = target.closest('.target-word');

        if (wordEl) {
            closePopup();
        }
    });

    // 4. Handle Popup Hover (Prevent closing when moving to popup)
    // We listen to a global event that the React component will dispatch
    window.addEventListener('historical-popup-enter', () => {
        isHoveringPopup = true;
        if (hoverTimer) clearTimeout(hoverTimer);
    });

    window.addEventListener('historical-popup-leave', () => {
        isHoveringPopup = false;
        closePopup();
    });
}
