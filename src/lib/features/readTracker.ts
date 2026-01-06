/**
 * Read Tracker - 阅读追踪器
 * 
 * 追踪用户阅读进度并标记为已读
 */
import { apiFetch } from '../../lib/api';

let readTimer: number | undefined;

/**
 * 追踪阅读进度
 */
export function trackReading() {
    if (readTimer) clearTimeout(readTimer);

    const main = document.querySelector('main[data-article-id]');
    const isAdmin = main?.getAttribute('data-is-admin') === 'true';
    if (!isAdmin) return;

    const articleId = main?.getAttribute('data-article-id');
    const currentMask = parseInt(main?.getAttribute('data-read-levels') || '0');

    const activeLevel = document.querySelector('.article-level[data-active]');
    if (!activeLevel || !articleId) return;

    const level = parseInt(activeLevel.getAttribute('data-level') || '1');
    const minutes = parseInt(activeLevel.getAttribute('data-minutes') || '1');

    // Check if fully covered (downward inclusion)
    const targetMask = (1 << level) - 1;
    if ((currentMask & targetMask) === targetMask) return;

    // Threshold: 50% of estimated time, minimum 10 seconds
    const threshold = Math.max(10000, minutes * 30 * 1000);

    readTimer = window.setTimeout(async () => {
        try {
            await apiFetch(`/api/articles/${articleId}/read`, {
                method: 'PATCH',
                body: JSON.stringify({ level })
            });
            main?.setAttribute('data-read-levels', String(currentMask | targetMask));
            console.log('[ReadTracker] Marked as read:', level);
        } catch (e) {
            console.error('[ReadTracker] Failed:', e);
        }
    }, threshold);
}

/**
 * 清除阅读追踪计时器
 */
export function clearReadTimer() {
    if (readTimer) {
        clearTimeout(readTimer);
        readTimer = undefined;
    }
}

/**
 * 初始化阅读追踪 (绑定事件)
 */
export function initReadTracker() {
    // 绑定 Visibility Change 以暂停/清除计时
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearReadTimer();
        } else {
            trackReading();
        }
    });

    // 初始化追踪
    trackReading();
}
