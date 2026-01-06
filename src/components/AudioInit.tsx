import { useEffect, useState } from 'react';
import { audioState, setPlaylist } from '../lib/store/audioStore';
import { preloadArticleAudio, clearCache, setPreloaderVoice } from '../lib/tts/audioPreloader';

interface AudioInitProps {
    allContent: { level: number, content: string }[];
}

/**
 * AudioInit Component
 * 
 * Initializes audio playlist and triggers auto-preload of TTS audio.
 * Listens for level changes and re-preloads when difficulty changes.
 */
export default function AudioInit({ allContent }: AudioInitProps) {
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

    // Listen for level change events
    useEffect(() => {
        const handleLevelChange = (e: CustomEvent) => {
            const level = e.detail?.level;
            if (level && level !== currentLevel) {
                console.log('[AudioInit] Level changed to:', level);
                clearCache();
                setCurrentLevel(level);
            }
        };

        window.addEventListener('level-change' as any, handleLevelChange);
        return () => window.removeEventListener('level-change' as any, handleLevelChange);
    }, [currentLevel]);

    // When level/content changes, update playlist and trigger preload
    useEffect(() => {
        if (!allContent || allContent.length === 0) return;

        const targetData = allContent.find(c => c.level === currentLevel) || allContent[0];
        const rawText = targetData.content;

        console.log(`[AudioInit] Initializing for Level ${currentLevel}`);

        // 1. Create full text: paragraphs joined with space
        const paragraphs = rawText.split('\n').map(p => p.trim()).filter(Boolean);
        const fullText = paragraphs.join(' ');

        // 2. Split fullText into sentences using Intl.Segmenter
        //    This ensures sentence offsets are DIRECTLY in fullText coordinate space
        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
        const rawSentences = Array.from(segmenter.segment(fullText));

        const segments: { text: string, isNewParagraph: boolean }[] = [];
        const sentenceOffsets: number[] = [];

        // Track paragraph boundaries in fullText
        let paragraphEndPositions: number[] = [];
        let pos = 0;
        for (const para of paragraphs) {
            pos += para.length;
            paragraphEndPositions.push(pos);
            pos += 1; // space
        }

        // Build segments with sentence info
        rawSentences.forEach((seg) => {
            const startIdx = seg.index;
            const text = seg.segment;

            // Check if this sentence starts a new paragraph
            // A sentence starts a new paragraph if its start position is right after a paragraph boundary
            const isNewParagraph = startIdx === 0 || paragraphEndPositions.some(
                endPos => startIdx === endPos + 1 || startIdx === endPos
            );

            segments.push({ text, isNewParagraph });
            sentenceOffsets.push(startIdx);
        });

        console.log('[AudioInit] Sentences:', segments.length, '- Sample offsets:', sentenceOffsets.slice(0, 5));

        // 3. Update store
        setPlaylist(segments, fullText);

        // 4. Sync voice and trigger preload
        const currentVoice = audioState.get().voice;
        setPreloaderVoice(currentVoice);

        audioState.setKey('isPreloading', true);
        preloadArticleAudio(fullText, currentLevel, sentenceOffsets, (loading) => {
            audioState.setKey('isPreloading', loading);
            if (!loading) {
                audioState.setKey('isReady', true);
                console.log('[AudioInit] Audio ready');
            }
        });

    }, [allContent, currentLevel]);

    return null;
}
