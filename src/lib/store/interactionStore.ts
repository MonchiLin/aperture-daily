/**
 * 交互状态管理 (Interaction Store)
 *
 * 核心职责：管理文章阅读时的交互状态（词汇悬停、级别切换、语义记忆）
 *
 * 架构设计：
 *
 *   ┌───────────────────┐     ┌───────────────────┐
 *   │ activeInteraction │     │  interactionStore │
 *   │   (事件层)         │ ──▶ │    (状态层)        │
 *   │  rect + word      │     │  activeWord + echo │
 *   └───────────────────┘     └───────────────────┘
 *            ↓                          ↓
 *     VisualTether 定位            WordSidebar 展示
 *
 * 为什么分两层？
 * - activeInteraction: 高频事件（鼠标位置），需 O(1) 更新
 * - interactionStore: 应用状态（当前词、echo 数据），用于 UI 渲染
 *
 * Echoes (语义记忆):
 * - 记录用户学过的词在历史文章中出现的上下文
 * - 悬停时展示 "你曾在 N 天前的文章中见过这个词"
 */

import { map } from 'nanostores';

// ════════════════════════════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════════════════════════════

/** Echo 数据：词汇历史上下文 */
export type EchoData = {
    snippet: string;
    articleTitle: string;
    articleId: string;
    date: string;
    timeAgo: string;
}[] | null;

/** 全局交互状态 */
export type InteractionState = {
    activeWord: string | null;       // 当前悬停词（小写）
    currentLevel: number;            // 当前难度级别
    echoData: EchoData;              // 词汇历史上下文
    hoveredSentenceIndex: number | null;  // 音频播放器同步高亮
}

/**
 * 交互事件（O(1) 性能优化）
 *
 * 独立于 interactionStore，避免高频鼠标移动触发全量重渲染
 */
export type InteractionEvent = {
    word: string;
    rect: { top: number; left: number; width: number; height: number };
    id: string;  // 强制更新的唯一 ID
} | null;

// ════════════════════════════════════════════════════════════════
// 状态定义
// ════════════════════════════════════════════════════════════════

/** 事件层：仅用于 VisualTether 定位 */
export const activeInteraction = map<{ current: InteractionEvent }>({ current: null });

/**
 * Echoes 注册表
 *
 * 由页面初始化时注入（SSR 数据），存储当前文章所有目标词的历史上下文。
 * 不作为 atom 导出，避免不必要的重渲染。
 */
let echoesRegistry: Record<string, any> = {};

/** 初始化 Echoes 数据 */
export const initEchoes = (echoes: Record<string, any>) => {
    echoesRegistry = echoes || {};
};

/** 查找词汇历史上下文 (内部 helper) */
function lookupEchoData(word: string): EchoData {
    const mems = echoesRegistry[word];
    if (mems && Array.isArray(mems) && mems.length > 0) {
        return mems.map(m => ({
            snippet: m.snippet,
            articleTitle: m.articleTitle,
            articleId: m.articleId,
            date: m.date,
            timeAgo: m.timeAgo || m.date
        }));
    }
    return null;
}

// ════════════════════════════════════════════════════════════════
// 交互处理
// ════════════════════════════════════════════════════════════════

/**
 * 设置交互状态（词汇悬停）
 *
 * @param word - 悬停的词汇
 * @param rect - 词汇 DOM 元素的位置（用于浮层定位）
 */
export const setInteraction = (word: string, rect: { top: number; left: number; width: number; height: number }) => {
    const normalized = word.toLowerCase();

    // 1. 更新事件层（高频）
    activeInteraction.setKey('current', {
        word: normalized,
        rect,
        id: crypto.randomUUID()
    });

    // 2. 更新状态层（仅在词变化时）
    const currentStore = interactionStore.get();
    if (currentStore.activeWord !== normalized) {
        interactionStore.setKey('activeWord', normalized);
        interactionStore.setKey('echoData', lookupEchoData(normalized));
    }
};

/** 清除交互状态（鼠标离开） */
export const clearInteraction = () => {
    activeInteraction.setKey('current', null);
    interactionStore.setKey('activeWord', null);
};

// ════════════════════════════════════════════════════════════════
// 状态 Store
// ════════════════════════════════════════════════════════════════

export const interactionStore = map<InteractionState>({
    activeWord: null,
    currentLevel: 1,
    echoData: null,
    hoveredSentenceIndex: null
});

// ════════════════════════════════════════════════════════════════
// Actions
// ════════════════════════════════════════════════════════════════

/** 设置音频播放器悬停句子索引（同步高亮） */
export const setHoveredSentence = (index: number | null) => {
    interactionStore.setKey('hoveredSentenceIndex', index);
};

/**
 * 设置当前活跃词汇
 *
 * 用于侧边栏点击等非悬停场景
 */
export const setActiveWord = (word: string | null) => {
    const normalized = word ? word.toLowerCase() : null;
    interactionStore.setKey('activeWord', normalized);
    interactionStore.setKey('echoData', normalized ? lookupEchoData(normalized) : null);
};

/** 切换文章难度级别 */
export const setLevel = (level: number) => {
    interactionStore.setKey('currentLevel', level);
};
