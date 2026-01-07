import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { audioState, setPlaylist } from '../lib/store/audioStore';
import { interactionStore } from '../lib/store/interactionStore';
import { preloadArticleAudio, clearCache, setPreloaderVoice } from '../lib/tts/audioPreloader';

interface SentenceData {
    id: number;
    start: number;
    end: number;
    text: string;
}

interface AudioInitProps {
    allContent: {
        level: number;
        content: string;
        sentences?: SentenceData[];
    }[];
    articleId: string;
}

/**
 * AudioInit Component - Refactored
 * 
 * 使用后端提供的 sentences 数据，不再客户端分句。
 */
export default function AudioInit({ allContent, articleId }: AudioInitProps) {
    const { currentLevel } = useStore(interactionStore);

    // Clear cache on level change
    useEffect(() => {
        console.log('[AudioInit] Level synced from store:', currentLevel);
        clearCache();
    }, [currentLevel]);

    // Use backend-provided sentences for playlist
    useEffect(() => {
        if (!allContent || allContent.length === 0) return;

        const targetData = allContent.find(c => c.level === currentLevel) || allContent[0];
        if (!targetData) return;

        const sentences = targetData.sentences || [];
        const rawText = targetData.content;

        console.log(`[AudioInit] Level ${currentLevel} - ${sentences.length} sentences from backend`);

        // Build segments from backend sentences
        const segments = sentences.map((s, i) => ({
            text: s.text,
            isNewParagraph: i === 0 || s.start > (sentences[i - 1]?.end ?? 0) + 1
        }));

        // Build full text for TTS (join with spaces/newlines as needed)
        const fullText = sentences.map(s => s.text).join(' ');

        // Use backend sentence offsets directly
        // Note: These are character offsets in original content, not in fullText
        // For TTS timing, we need offsets in the joined fullText
        let offset = 0;
        const sentenceOffsets: number[] = [];
        for (const s of sentences) {
            sentenceOffsets.push(offset);
            offset += s.text.length + 1; // +1 for space
        }

        console.log('[AudioInit] Sentence offsets:', sentenceOffsets.slice(0, 5));

        // Update store
        setPlaylist(segments, fullText);

        // Sync voice and trigger preload
        const currentVoice = audioState.get().voice;
        setPreloaderVoice(currentVoice);

        audioState.setKey('isPreloading', true);
        preloadArticleAudio(fullText, currentLevel, sentenceOffsets, articleId, (loading) => {
            audioState.setKey('isPreloading', loading);
            if (!loading) {
                audioState.setKey('isReady', true);
                console.log('[AudioInit] Audio ready');
            }
        });

    }, [allContent, currentLevel, articleId]);

    return null;
}
