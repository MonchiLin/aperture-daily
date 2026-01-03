import { useEffect, useState } from 'react';
import { setPlaylist } from '../lib/store/audioStore';

interface AudioInitProps {
    allContent: { level: number, content: string }[];
}

/**
 * 音频初始化组件
 * 监听难度切换并将当前难度的文章内容分割为播放列表同步至全局 Store
 */
export default function AudioInit({ allContent }: AudioInitProps) {
    // 默认 Level 1 (从 LocalStorage 同步读取以避免 Flash)
    const [currentLevel, setCurrentLevel] = useState(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('aperture-daily_preferred_level');
                return parseInt(saved || '1') || 1;
            } catch {
                return 1;
            }
        }
        return 1;
    });

    // 监听难度切换事件
    useEffect(() => {
        const handleLevelChange = (e: CustomEvent) => {
            const level = e.detail?.level;
            if (level) {
                console.log('[AudioInit] Level changed to:', level);
                setCurrentLevel(level);
            }
        };

        window.addEventListener('level-change' as any, handleLevelChange);

        return () => {
            window.removeEventListener('level-change' as any, handleLevelChange);
        };
    }, []);

    // 当 Level 变化或 content 变化时，更新播放列表
    useEffect(() => {
        if (!allContent || allContent.length === 0) return;

        const targetData = allContent.find(c => c.level === currentLevel) || allContent[0];
        const rawText = targetData.content;

        console.log(`[AudioInit] Generating playlist for Level ${currentLevel}, length: ${rawText.length}`);

        // 将文章内容按段落分割 (Server-side 逻辑的镜像)
        const paragraphs = rawText
            .split('\n')
            .map(p => p.trim())
            .filter(Boolean);

        console.log('[AudioInit] Generated segments:', paragraphs.length);

        // 初始化 playlist
        setPlaylist(paragraphs);
    }, [allContent, currentLevel]);

    return null;
}
