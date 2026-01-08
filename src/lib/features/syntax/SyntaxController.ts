/**
 * Feature: Analysis Focus Manager (分析聚焦管理器)
 * 
 * 管理 "Structure Analysis" (结构分析) 功能的用户交互。
 * 
 * **Behaviors (行为)**:
 * 1. **Click-to-Focus (点击聚焦)**:
 *    - 点击句子 Token (`.s-token`) 会激活该句子的 `analysis-focus` 状态。
 *    - 严格的单句聚焦模式 (Strict single-sentence focus)，点击新句子会清除以前的聚焦。
 *    - 点击文章外部区域会清除聚焦。
 * 2. **Unified Hover (统一悬停)**:
 *    - 悬停在句子内的任意 Token 上，都会高亮整句 (`.sentence-hover`)。
 * 3. **Keyboard (键盘交互)**:
 *    - 按下 `Escape` 键清除聚焦。
 * 4. **Smart Copy (智能复制)**:
 *    - 如果在设置中开启，激活句子时会自动将其文本复制到剪贴板。
 * 
 * **Architecture (架构)**:
 * - **Event Delegation (事件代理)**: 在 `document` 层级监听事件，避免为数千个 Token 单独绑定监听器。
 * - **Scoped DOM Query**: 将查询限制在 `.article-level` 容器内，防止跨 Level 的 SID 冲突。
 * - **Idempotency**: 通过 `data-analysis-init` 属性防止重复初始化。
 */

import { visualizeSyntax, clearSyntaxVisuals } from './SyntaxVisualizer';
import { settingsStore } from '../../store/settingsStore';
import { audioState } from '../../store/audioStore';
import { interactionStore } from '../../store/interactionStore';

export function initSyntaxController() {
    if (typeof document === 'undefined') return;

    const ATTR_INIT = 'data-analysis-init';
    // 分析聚焦状态 (Analysis Focus State): 点击句子触发，显示分析标签并高亮成分
    const CLASS_FOCUS = 'analysis-focus';
    const CLASS_HOVER = 'sentence-hover';
    const SELECTOR_TOKEN = '.s-token';
    const SELECTOR_CONTAINER = '#article-content';
    const SELECTOR_LEVEL = '.article-level';

    // Idempotency Check: Prevent duplicate initialization
    if (document.body.hasAttribute(ATTR_INIT)) return;
    document.body.setAttribute(ATTR_INIT, 'true');

    console.log('[Analysis] Initializing Focus Manager (Scoped)...');

    // --- Click Delegation ---
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        // 1. Context Check: Inside Article?
        const articleContent = target.closest(SELECTOR_CONTAINER);

        // Case A: Click OUTSIDE (Dismiss)
        if (!articleContent) {
            clearAllActive(CLASS_FOCUS);
            clearSyntaxVisuals();
            return;
        }

        // Case B: Click INSIDE
        const token = target.closest(SELECTOR_TOKEN);
        if (token instanceof HTMLElement) {
            const sid = token.dataset.sid;
            // [Fix] Scope to the active level container to prevent cross-level collision
            const levelContainer = token.closest(SELECTOR_LEVEL);

            if (sid && levelContainer instanceof HTMLElement) {
                // Strategy: Clear Everything -> Activate Target (Scoped)
                clearAllActive(CLASS_FOCUS);
                clearSyntaxVisuals();

                activateSentence(levelContainer, sid, CLASS_FOCUS);

                // Position labels relative to the article content container
                requestAnimationFrame(() => {
                    if (articleContent instanceof HTMLElement) {
                        visualizeSyntax(articleContent);
                    }
                });
                return;
            }
        }

        // Case C: Clicked whitespace or non-token inside article (Dismiss)
        clearAllActive(CLASS_FOCUS);
        clearSyntaxVisuals();
    });

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearAllActive(CLASS_FOCUS);
            clearSyntaxVisuals();
        }
    });

    // --- Hover Delegation (Unified Highlight) ---
    // ...

    // --- Resize Handling (Robustness) ---
    let resizeTimer: number;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            // Re-calculate positions if there are active structure elements
            const activeElements = document.querySelectorAll(`.${CLASS_FOCUS}`);
            if (activeElements.length > 0) {
                const articleContent = document.querySelector(SELECTOR_CONTAINER) as HTMLElement;
                if (articleContent) {
                    visualizeSyntax(articleContent);
                }
            }
        }, 100); // Debounce 100ms
    });

    // --- Sync Hover from Interaction Store ---
    // Replaces 'sync-sentence-hover' event listener
    interactionStore.subscribe((state) => {
        const sid = state.hoveredSentenceIndex;
        const level = document.querySelector(SELECTOR_LEVEL + '[data-active]'); // Only apply to active level

        // Remove existing hover highlights from this level first (optional but safer)
        if (level instanceof HTMLElement) {
            const existing = level.querySelectorAll(`.${CLASS_HOVER}`);
            existing.forEach(el => el.classList.remove(CLASS_HOVER));

            if (typeof sid === 'number' && sid >= 0) {
                toggleSentenceClass(level, sid.toString(), CLASS_HOVER, true);
            }
        }
    });

    // --- Sync Audio Playback Highlight from Audio Store ---
    // Replaces 'audio-sentence-change' event listener
    let lastPlayingSid: number = -1;
    const HIGHLIGHT_CLASSES = 'bg-purple-100 text-purple-900 shadow-sm ring-1 ring-purple-200 rounded transition-colors duration-200';

    audioState.subscribe((state) => {
        const { currentIndex, isPlaying } = state;
        const level = document.querySelector(SELECTOR_LEVEL + '[data-active]');

        if (!(level instanceof HTMLElement)) return;

        // Clear previous highlight if index changed
        if (lastPlayingSid !== -1 && lastPlayingSid !== currentIndex) {
            toggleSentenceClass(level, lastPlayingSid.toString(), HIGHLIGHT_CLASSES, false);
        }

        // Also clear if paused? No, usually we keep highlight when paused for reference.
        // But if we stopped (currentIndex 0, !isPlaying), maybe we should clear if it was reset?
        // Actually, let's strictly follow isPlaying for "Active" look, or just position.
        // The original logic cleared highlight if !isPlaying.

        if (!isPlaying) {
            if (lastPlayingSid !== -1) {
                toggleSentenceClass(level, lastPlayingSid.toString(), HIGHLIGHT_CLASSES, false);
                lastPlayingSid = -1;
            }
            return;
        }

        // Apply new highlight
        if (isPlaying && currentIndex >= 0) {
            // Ensure previous is cleared (double check)
            if (lastPlayingSid !== -1 && lastPlayingSid !== currentIndex) {
                toggleSentenceClass(level, lastPlayingSid.toString(), HIGHLIGHT_CLASSES, false);
            }

            toggleSentenceClass(level, currentIndex.toString(), HIGHLIGHT_CLASSES, true);
            lastPlayingSid = currentIndex;

            // Auto-scroll to keep playing sentence in view
            const firstToken = level.querySelector(`.s-token[data-sid="${currentIndex}"]`);
            if (firstToken) {
                firstToken.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
}

/**
 * Removes the active class from ALL elements in the DOM.
 * We clear globally to be safe (ensure no stuck states in hidden levels).
 */
function clearAllActive(className: string) {
    const activeElements = document.querySelectorAll(`.${className}`);
    if (activeElements.length > 0) {
        activeElements.forEach(el => el.classList.remove(className));
    }
}

/**
 * Adds the active class to tokens belonging to a specific Sentence ID (sid),
 * BUT ONLY within the specified level container.
 */
function activateSentence(container: HTMLElement, sid: string, className: string) {
    const tokens = container.querySelectorAll(`.s-token[data-sid="${sid}"]`);
    if (tokens.length > 0) {
        tokens.forEach(el => el.classList.add(className));

        // [Feature] Smart Copy - Auto copy sentence text to clipboard
        const { autoCopy } = settingsStore.get();
        if (autoCopy) {
            try {
                // Construct text from token content (preserves spaces)
                const text = Array.from(tokens).map(t => t.textContent).join('');
                if (text) {
                    navigator.clipboard.writeText(text).then(() => {
                        console.log('[Structure] Auto-copied:', text.substring(0, 30) + '...');
                    }).catch(err => {
                        console.warn('[Structure] Copy failed:', err);
                    });
                }
            } catch (e) {
                console.warn('[Structure] Auto-copy logic error:', e);
            }
        }
    }
}

/**
 * Helper to add/remove class for a whole sentence (Scoped).
 */
function toggleSentenceClass(container: HTMLElement, sid: string, className: string, add: boolean) {
    const tokens = container.querySelectorAll(`.s-token[data-sid="${sid}"]`);
    const classes = className.split(' ').filter(Boolean);
    tokens.forEach(el => {
        if (add) el.classList.add(...classes);
        else el.classList.remove(...classes);
    });
}
