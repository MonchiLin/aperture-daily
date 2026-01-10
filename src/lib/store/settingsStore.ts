/**
 * 用户设置状态管理 (Settings Store)
 *
 * 持久化存储用户偏好设置，使用 localStorage 实现跨会话保持。
 *
 * 设置项：
 * - autoCopy: 点击词汇时是否自动复制到剪贴板
 * - defaultLevel: 默认显示的文章难度级别 (1-3)
 */

import { persistentAtom } from '@nanostores/persistent';

interface Settings {
    autoCopy: boolean;
    defaultLevel: 1 | 2 | 3;
}

/**
 * 持久化用户设置
 *
 * 存储于 localStorage，键名：aperture-daily-preferences
 */
export const settingsStore = persistentAtom<Settings>(
    'aperture-daily-preferences',
    {
        autoCopy: false,
        defaultLevel: 1,
    },
    {
        encode: JSON.stringify,
        decode: JSON.parse,
    }
);

/** 更新单个设置项（保持其他设置不变） */
export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    settingsStore.set({
        ...settingsStore.get(),
        [key]: value
    });
}

