/**
 * Level Switcher - 难度切换器
 * 
 * 优先级: URL > 单篇文章记录 > 设置默认值 > 兜底 L1
 * 
 * URL 模式:
 *   - /article/{id} → 使用设置默认值
 *   - /article/{id}/L1 → L1 (算手动选择)
 *   - /article/{id}/L2 → L2 (算手动选择)
 *   - /article/{id}/L3 → L3 (算手动选择)
 */

import { setLevel as storeSetLevel } from '../../store/interactionStore';
import { settingsStore } from '../../store/settingsStore';

/** Storage key prefix for per-article level */
const ARTICLE_LEVEL_PREFIX = 'aperture-daily_article_';

/** 设置单个元素的 active 状态 */
const setActive = (el: Element, active: boolean, activeClasses?: string[], inactiveClasses?: string[]) => {
    el.toggleAttribute('data-active', active);
    if (activeClasses && inactiveClasses) {
        el.classList.toggle('bg-slate-900', active);
        el.classList.toggle('text-white', active);
        el.classList.toggle('border-slate-900', active);
        el.classList.toggle('bg-transparent', !active);
        el.classList.toggle('text-stone-400', !active);
        el.classList.toggle('border-transparent', !active);
    }
};

/** 从 URL 读取级别 (/[date]/[slug]/L[1-3]) */
const getLevelFromUrl = (): number | null => {
    // Match /L1, /L2, /L3 at the end
    const match = window.location.pathname.match(/\/L([1-3])$/i);
    return match ? parseInt(match[1]) : null;
};

/** 从 URL 或 DOM 获取文章 ID (ID 仍在 DOM 中, URL 不再含 ID) */
const getArticleId = (): string | null => {
    // 优先从 DOM 获取 (最可靠)
    const main = document.querySelector('main[data-article-id]');
    if (main) {
        return main.getAttribute('data-article-id');
    }
    // URL 不再包含 ID，所以必须依赖 DOM
    return null;
};

/** 获取单篇文章的保存级别 */
const getArticleLevel = (articleId: string): number | null => {
    try {
        const saved = localStorage.getItem(`${ARTICLE_LEVEL_PREFIX}${articleId}_level`);
        if (saved) {
            const level = parseInt(saved);
            return level >= 1 && level <= 3 ? level : null;
        }
    } catch { /* ignore */ }
    return null;
};

/** 保存单篇文章的级别 */
const saveArticleLevel = (articleId: string, level: number) => {
    try {
        localStorage.setItem(`${ARTICLE_LEVEL_PREFIX}${articleId}_level`, String(level));
    } catch { /* ignore */ }
};

/** 获取设置面板的默认级别 */
const getDefaultLevel = (): number => {
    try {
        const settings = settingsStore.get();
        return settings.defaultLevel || 1;
    } catch {
        return 1;
    }
};

/** 更新 URL 中的级别 (使用 replaceState 避免历史堆积) */
const updateUrlLevel = (level: number) => {
    // 移除现有的 /L1, /L2, /L3 后缀
    const base = window.location.pathname.replace(/\/L[1-3]$/i, '');
    // L1 使用简洁路径，L2/L3 显式包含
    const newPath = level === 1 ? base : `${base}/L${level}`;
    if (window.location.pathname !== newPath) {
        history.replaceState(null, '', newPath);
    }
};

/**
 * 获取初始级别
 * 优先级: URL > 单篇文章记录 > 设置默认值 > 兜底 1
 */
const getInitialLevel = (articleId: string | null): { level: number; fromUrl: boolean } => {
    // 1. URL 指定的级别 (算手动选择)
    const urlLevel = getLevelFromUrl();
    if (urlLevel !== null) {
        return { level: urlLevel, fromUrl: true };
    }

    // 2. 单篇文章的保存记录
    if (articleId) {
        const articleLevel = getArticleLevel(articleId);
        if (articleLevel !== null) {
            return { level: articleLevel, fromUrl: false };
        }
    }

    // 3. 设置面板默认值
    return { level: getDefaultLevel(), fromUrl: false };
};

/**
 * 初始化难度切换器
 */
export function initLevelSwitcher() {
    const levels = document.querySelectorAll<HTMLElement>('.article-level');
    const buttons = document.querySelectorAll<HTMLElement>('[data-level-btn]');
    const readingTimeEl = document.getElementById('reading-time');
    const articleId = getArticleId();

    if (!levels.length || !buttons.length) return;

    const setLevel = (level: number, saveToArticle = true, updateUrl = true) => {
        // 更新内容层
        levels.forEach(el => {
            const isActive = parseInt(el.dataset.level || '0') === level;
            setActive(el, isActive);
            if (isActive && readingTimeEl) {
                const mins = el.dataset.minutes || '1';
                readingTimeEl.textContent = `${mins} ${+mins === 1 ? 'minute' : 'minutes'}`;
            }
        });

        // 更新按钮
        buttons.forEach(btn => {
            setActive(btn, parseInt(btn.dataset.levelBtn || '0') === level, [], []);
        });

        // 保存到单篇文章记录
        if (saveToArticle && articleId) {
            saveArticleLevel(articleId, level);
        }

        // 更新 URL
        if (updateUrl) {
            updateUrlLevel(level);
        }

        window.dispatchEvent(new CustomEvent('level-change', { detail: { level } }));
        storeSetLevel(level);
    };

    // 绑定点击 (用户手动切换，保存到文章)
    buttons.forEach(btn => {
        btn.addEventListener('click', () => setLevel(parseInt(btn.dataset.levelBtn || '1'), true, true));
    });

    // 获取初始级别
    const { level: initialLevel, fromUrl } = getInitialLevel(articleId);

    // 如果来自 URL，保存到文章记录
    if (fromUrl && articleId) {
        saveArticleLevel(articleId, initialLevel);
    }

    // 初始化 (不更新 URL，因为 SSR 已设置正确路径，或者首次访问保持简洁)
    setLevel(initialLevel, false, false);

    return { setLevel };
}
