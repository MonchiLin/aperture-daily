/**
 * 用户设置状态管理 (Settings Store)
 *
 * 持久化存储用户偏好设置，使用 localStorage 实现跨会话保持。
 *
 * 设置项：
 * - autoCopy: 点击词汇时是否自动复制到剪贴板
 * - defaultLevel: 默认显示的文章难度级别 (1-3)
 * - readingStyles: 不同生成模式的阅读风格配置
 */

import { persistentAtom } from '@nanostores/persistent';

/** 阅读风格类型 */
export type ReadingStyle = 'default' | 'impression';

/** 生成模式类型 */
export type GenerationMode = 'rss' | 'impression';

/** 各生成模式的阅读风格配置 */
export interface ReadingStylesConfig {
    /** RSS 模式使用的阅读风格 */
    rss: ReadingStyle;
    /** Impression 模式使用的阅读风格 */
    impression: ReadingStyle;
}

export interface Settings {
    autoCopy: boolean;
    defaultLevel: 1 | 2 | 3;
    readingStyles: ReadingStylesConfig;
}

/**
 * 持久化用户设置
 *
 * 存储于 localStorage，键名：upword-preferences
 */
export const settingsStore = persistentAtom<Settings>(
    'upword-preferences',
    {
        autoCopy: false,
        defaultLevel: 1,
        readingStyles: {
            rss: 'default',           // RSS 模式默认使用默认风格
            impression: 'impression', // Impression 模式默认使用 Impression 风格
        },
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

/** 更新指定生成模式的阅读风格 */
export function updateReadingStyle(mode: GenerationMode, style: ReadingStyle) {
    const current = settingsStore.get();
    settingsStore.set({
        ...current,
        readingStyles: {
            ...current.readingStyles,
            [mode]: style,
        },
    });
}

/** 根据生成模式获取对应的阅读风格 */
export function getReadingStyleForMode(mode: GenerationMode): ReadingStyle {
    return settingsStore.get().readingStyles[mode];
}
