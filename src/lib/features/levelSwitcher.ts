/**
 * Level Switcher - 难度切换器
 * 
 * 使用简洁的声明式风格处理难度切换
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

/**
 * 初始化难度切换器
 */
export function initLevelSwitcher() {
    const levels = document.querySelectorAll<HTMLElement>('.article-level');
    const buttons = document.querySelectorAll<HTMLElement>('[data-level-btn]');
    const readingTimeEl = document.getElementById('reading-time');

    if (!levels.length || !buttons.length) return;

    const setLevel = (level: number) => {
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

        saveLevel(level);
        window.dispatchEvent(new CustomEvent('level-change', { detail: { level } }));
    };

    // 绑定点击
    buttons.forEach(btn => {
        btn.addEventListener('click', () => setLevel(parseInt(btn.dataset.levelBtn || '1')));
    });

    // 初始化
    setLevel(getSavedLevel());

    return { setLevel };
}
