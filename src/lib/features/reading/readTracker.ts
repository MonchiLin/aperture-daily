/**
 * Read Tracker - 阅读追踪器
 * 
 * 追踪用户阅读进度并标记为已读
 */
import { apiFetch } from '../../api';

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

    // [Downward Inclusion Strategy]
    // 逻辑：如果你把 "Level 3" 的文章读完了，通常意味着你也理解了 Level 1 和 Level 2 的内容。
    // 为了简化用户操作，我们假设阅读高等级会自动解锁低等级的阅读状态。
    // targetMask (111 for L3, 011 for L2, 001 for L1).
    const targetMask = (1 << level) - 1;

    // 位运算检查：(Current & Target) === Target
    // 意味着 Target 的所有位都已经在 Current 中置 1 了，无需重复提交。
    if ((currentMask & targetMask) === targetMask) return;

    // [Smart Thresholding]
    // 为了防止“误触”或“每秒提交”，我们设置一个动态阈值。
    // 阈值 = 估算阅读时间的 50%，且至少 10 秒。
    // 只有当用户停留在页面超过此时间，才算“有效阅读”。
    const threshold = Math.max(10000, minutes * 30 * 1000);

    readTimer = window.setTimeout(async () => {
        try {
            await apiFetch(`/api/articles/${articleId}/read`, {
                method: 'PATCH',
                body: JSON.stringify({ level })
            });
            // Update DOM state optimistically
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
