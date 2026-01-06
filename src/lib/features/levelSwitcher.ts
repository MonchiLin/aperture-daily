/**
 * Level Switcher - 难度切换器
 * 
 * 支持 URL 和 localStorage 双重级别存储
 * 优先级: URL > data-initial-level > localStorage > 默认值 1
 * 
 * URL 模式:
 *   - /article/{id} → 默认 L1
 *   - /article/{id}/L1 → L1
 *   - /article/{id}/L2 → L2
 *   - /article/{id}/L3 → L3
 */

const STORAGE_KEY = 'aperture-daily_preferred_level';

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

/** 从 URL 读取级别 */
const getLevelFromUrl = (): number | null => {
    const match = window.location.pathname.match(/\/article\/[^/]+\/L([1-3])$/i);
    return match ? parseInt(match[1]) : null;
};

/** 从 data-initial-level 属性读取 SSR 初始级别 */
const getInitialLevelFromDom = (): number | null => {
    const main = document.querySelector('main[data-initial-level]');
    const level = main?.getAttribute('data-initial-level');
    if (level) {
        const parsed = parseInt(level);
        return parsed >= 1 && parsed <= 3 ? parsed : null;
    }
    return null;
};

/** 从 localStorage 读取保存的难度 */
const getSavedLevel = (): number => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const level = saved ? parseInt(saved) : 1;
        return level >= 1 && level <= 3 ? level : 1;
    } catch {
        return 1;
    }
};

/** 保存难度到 localStorage */
const saveLevel = (level: number) => {
    try {
        localStorage.setItem(STORAGE_KEY, String(level));
    } catch { /* ignore */ }
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
 * 优先级: URL > DOM attribute > localStorage > 默认值 1
 */
const getInitialLevel = (): number => {
    return getLevelFromUrl() ?? getInitialLevelFromDom() ?? getSavedLevel();
};

/**
 * 初始化难度切换器
 */
export function initLevelSwitcher() {
    const levels = document.querySelectorAll<HTMLElement>('.article-level');
    const buttons = document.querySelectorAll<HTMLElement>('[data-level-btn]');
    const readingTimeEl = document.getElementById('reading-time');

    if (!levels.length || !buttons.length) return;

    const setLevel = (level: number, updateUrl = true) => {
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

        // 保存到 localStorage 和更新 URL
        saveLevel(level);
        if (updateUrl) {
            updateUrlLevel(level);
        }

        window.dispatchEvent(new CustomEvent('level-change', { detail: { level } }));
    };

    // 绑定点击
    buttons.forEach(btn => {
        btn.addEventListener('click', () => setLevel(parseInt(btn.dataset.levelBtn || '1')));
    });

    // 初始化 (不更新 URL，因为 SSR 已设置正确路径)
    setLevel(getInitialLevel(), false);

    return { setLevel };
}
