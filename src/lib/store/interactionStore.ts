/**
 * [交互状态管理 Store (interactionStore.ts)]
 * ------------------------------------------------------------------
 * 功能：管理文章阅读时的深层交互状态（词汇悬停、历史回响、难度切换）。
 *
 * 核心架构: **双层状态机 (Two-Tier State Design)**
 * 1. Event Layer (activeInteraction): 极简原子状态 (Atom)，专攻高频坐标更新。
 *    - 优势：O(1) 性能。鼠标移动时只更新 rect，不触发 React 全量 Diff。
 * 2. State Layer (interactionStore): 业务衍生状态 (Derived)，负责数据查找。
 *    - 机制：仅在 word 发生实质变化时计算 (Memoized)，避免无意义的 map lookup。
 *
 * 内存策略:
 * - `definitionsRegistry` 使用全局单例 (Singleton Pattern) 而非 Store。
 * - 理由：词典数据庞大且静态，注入 Context 会导致 React Tree 主要是垃圾回收压力。
 */

import { map, atom } from 'nanostores';

// ════════════════════════════════════════════════════════════════
// Popover Hover State (替代 window 事件)
// ════════════════════════════════════════════════════════════════

/**
 * Popover 悬停状态
 * 
 * 解决问题：鼠标从单词移动到 Popover 时，Popover 不应关闭。
 * 原方案使用 window.dispatchEvent 是反模式，现改用 nanostores。
 */
export const popoverHoverState = atom<boolean>(false);

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

/** 单词定义数据 (From loader.ts -> types.ts WordDefinition) */
export interface WordDefinitionData {
    word: string;
    phonetic?: string;
    reading?: string; // ja-JP
    definition: string;
    translation?: string;
    pos?: string;
    audio?: string;
}

/** 全局交互状态 */
export type InteractionState = {
    activeWord: string | null;       // 当前悬停词（小写）
    currentLevel: number;            // 当前难度级别
    echoData: EchoData;              // 词汇历史上下文
    definition: WordDefinitionData | null; // 单词定义
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
 * [Static Registry Pattern]
 * 意图：作为 SSR 数据的"静态缓存池"。
 * 优化：不放入 Atom 的原因是它们属于"只读环境量"，不需要 Reactive 更新。
 *      Component 使用时直接查表 (Direct Lookup)，避开了 Subscription 开销。
 */
let echoesRegistry: Record<string, any> = {};

/** 初始化 Echoes 数据 */
export const initEchoes = (echoes: Record<string, any>) => {
    echoesRegistry = echoes || {};
};

/**
 * 单词定义注册表
 */
let definitionsRegistry: Record<string, WordDefinitionData> = {};

/** 初始化定义数据 */
/** 初始化定义数据 */
export const initDefinitions = (defs: any[]) => {
    // 转换为 Map 以便快速查找 (Key = lowercase)
    definitionsRegistry = {};
    defs.forEach(d => {
        // [Adapter] Handle Server Schema (definitions: Array) -> Store Schema (definition: string)
        let primaryDef = '';
        let primaryPos = '';

        if (d.definitions && Array.isArray(d.definitions) && d.definitions.length > 0) {
            primaryDef = d.definitions[0].definition;
            primaryPos = d.definitions[0].pos;
        } else if (typeof d.definition === 'string') {
            // Fallback: already flat
            primaryDef = d.definition;
            primaryPos = d.pos || '';
        }

        definitionsRegistry[d.word.toLowerCase()] = {
            ...d,
            definition: primaryDef,
            pos: primaryPos
        };
    });
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

/** 查找单词定义 */
export function lookupDefinition(word: string): WordDefinitionData | null {
    return definitionsRegistry[word.toLowerCase()] || null;
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

    // [Performance Optimization]
    // 意图：Separation of Update Frequency (频率分离)。
    // 1. 坐标 (Rect) 是高频易变数据 -> 写入 Event Layer (Atom) -> 仅触发 VirtualRef 的 Effect。
    // 2. 词 (Word) 是低频业务数据 -> 写入 State Layer (Map) -> 触发 React UI 重绘。
    // 结果：鼠标微动不会导致整个 Popover 组件重渲染。

    // 1. Event Layer (Positioning)
    activeInteraction.setKey('current', {
        word: normalized,
        rect,
        id: Math.random().toString(36).slice(2)
    });

    // 2. State Layer (Content)
    if (interactionStore.get().activeWord !== normalized) {
        interactionStore.setKey('activeWord', normalized);
        interactionStore.setKey('echoData', lookupEchoData(normalized));
        interactionStore.setKey('definition', lookupDefinition(normalized));
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
    definition: null, // Add definition to store state
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
    interactionStore.setKey('definition', normalized ? lookupDefinition(normalized) : null);
};

/** 切换文章难度级别 */
export const setLevel = (level: number) => {
    interactionStore.setKey('currentLevel', level);
};
