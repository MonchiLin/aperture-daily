import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { audioState } from '../lib/store/audioStore';
import { setMemoryData, interactionStore } from '../lib/store/interactionStore';

interface HighlightManagerProps {
    memoriesMap?: Record<string, any>;
}

/**
 * HighlightManager - Simplified
 * 
 * 职责简化为：
 * 1. 监听音频播放状态，应用句子高亮
 * 2. 处理单词 hover 的 memory 查询
 */
export default function HighlightManager({
    memoriesMap = {}
}: HighlightManagerProps) {

    const { activeWord, currentLevel } = useStore(interactionStore);
    const playbackActiveSidRef = useRef<number | null>(null);
    const { currentIndex, isPlaying } = useStore(audioState);

    // [Store Sync] 查找 active word 的 memory
    useEffect(() => {
        if (!activeWord) return;

        const normalized = activeWord.toLowerCase();
        const mems = memoriesMap[normalized];

        if (mems && Array.isArray(mems)) {
            setMemoryData(mems.map(m => ({
                snippet: m.snippet,
                articleTitle: m.articleTitle,
                articleId: m.articleId,
                date: m.date,
                timeAgo: m.timeAgo || m.date
            })));
        }
    }, [activeWord, memoriesMap]);

    // [Audio Sync] 朗读高亮同步
    useEffect(() => {
        const levelContainer = document.querySelector(`.article-level[data-level="${currentLevel}"]`);
        if (!levelContainer) return;

        // 清除旧高亮
        if (playbackActiveSidRef.current !== null) {
            const oldSid = playbackActiveSidRef.current;
            const oldTokens = levelContainer.querySelectorAll(`.s-token[data-sid="${oldSid}"]`);
            oldTokens.forEach(t => t.classList.remove('audio-active-sentence'));
            playbackActiveSidRef.current = null;
        }

        if (!isPlaying || currentIndex < 0) return;

        // 应用新高亮 (currentIndex 现在就是 sid)
        const targetTokens = levelContainer.querySelectorAll(`.s-token[data-sid="${currentIndex}"]`);
        if (targetTokens.length > 0) {
            targetTokens.forEach(t => t.classList.add('audio-active-sentence'));
            playbackActiveSidRef.current = currentIndex;

            // 自动滚动
            const firstToken = targetTokens[0] as HTMLElement;
            if (firstToken) {
                firstToken.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

    }, [currentIndex, isPlaying, currentLevel]);

    return null;
}
