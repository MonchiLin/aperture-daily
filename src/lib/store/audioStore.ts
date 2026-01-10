/**
 * 音频状态管理 (Audio Store)
 *
 * 管理文章朗读功能的全局状态，与 FloatingAudioPlayer 组件配合使用。
 *
 * 核心机制：
 * 1. Playlist 模式：将文章按句子拆分为播放列表
 * 2. 字符级高亮：通过 charIndex 实现当前朗读位置的实时高亮
 * 3. 预加载：isPreloading 标识 TTS 音频正在生成中
 *
 * 状态流转：
 *   idle → (setPlaylist) → ready → (play) → playing → (pause/end) → ready
 *         ↓ (preload)
 *       preloading
 */

import { map } from 'nanostores';

/** 音频片段（通常是一个句子） */
export interface AudioSegment {
    text: string;
    isNewParagraph: boolean;  // 是否是段落开头（用于 UI 视觉分隔）
}

/**
 * 音频状态接口
 *
 * 字段说明：
 * - playlist: 句子列表（播放单元）
 * - fullText: 完整文章文本（用于 TTS 合成）
 * - currentIndex: 当前播放的句子索引
 * - charIndex: 当前字符偏移量（-1 表示无高亮）
 * - isPlaying: 播放/暂停状态
 * - playbackRate: 播放速度（0.75x ~ 1.5x）
 * - isPreloading: TTS 正在生成中
 * - isReady: 音频已加载可播放
 * - voice: TTS 语音（Edge TTS 格式）
 */
export interface AudioState {
    playlist: AudioSegment[];
    fullText: string;
    currentIndex: number;
    charIndex: number;
    isPlaying: boolean;
    playbackRate: number;
    isPreloading: boolean;
    isReady: boolean;
    voice: string;
}

// nanostores 的 map 比 atom 更适合频繁部分更新的场景
export const audioState = map<AudioState>({
    playlist: [],
    fullText: '',
    currentIndex: 0,
    charIndex: -1,  // -1 表示无高亮
    isPlaying: false,
    playbackRate: 1.0,
    isPreloading: false,
    isReady: false,
    voice: 'en-US-GuyNeural'  // 默认使用自然的美式男声
});

// ─────────────────────────────────────────────────────────────
// Actions（状态变更函数）
// ─────────────────────────────────────────────────────────────

/** 切换 TTS 语音 */
export const setVoice = (voice: string) => {
    audioState.setKey('voice', voice);
};

/**
 * 设置播放列表
 *
 * 重置所有播放状态，准备新的音频内容
 */
export const setPlaylist = (segments: AudioSegment[], fullText: string) => {
    // 过滤空片段
    const clean = segments.filter(s => s.text.trim().length > 0);
    audioState.setKey('playlist', clean);
    audioState.setKey('fullText', fullText);
    audioState.setKey('currentIndex', 0);
    audioState.setKey('isPlaying', false);
    audioState.setKey('charIndex', -1);
    audioState.setKey('isReady', false);
};

/** 调整播放速度 */
export const setPlaybackRate = (rate: number) => {
    audioState.setKey('playbackRate', rate);
};

/** 切换播放/暂停 */
export const togglePlay = () => {
    const s = audioState.get();
    audioState.setKey('isPlaying', !s.isPlaying);
};

