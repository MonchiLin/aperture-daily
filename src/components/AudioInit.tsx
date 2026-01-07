import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { audioState, setPlaylist } from '../lib/store/audioStore';
import { interactionStore } from '../lib/store/interactionStore';
import { preloadArticleAudio, clearCache, setPreloaderVoice } from '../lib/tts/audioPreloader';
import { UniversalTokenizer } from '../lib/utils/tokenizer';

interface AudioInitProps {
    allContent: { level: number, content: string }[];
    articleId: string;
}

/**
 * AudioInit Component
 * 
 * Initializes audio playlist and triggers auto-preload of TTS audio.
 * Listens for level changes and re-preloads when difficulty changes.
 */
export default function AudioInit({ allContent, articleId }: AudioInitProps) {
    // Use centralized store for level
    const { currentLevel } = useStore(interactionStore);

    // Initial sync removed as useStore handles it.
    // Effect to clear cache on level change is still needed, but can react to 'currentLevel'
    useEffect(() => {
        console.log('[AudioInit] Level synced from store:', currentLevel);
        clearCache();
    }, [currentLevel]);

    // When level/content changes, update playlist and trigger preload
    useEffect(() => {
        if (!allContent || allContent.length === 0) return;

        const targetData = allContent.find(c => c.level === currentLevel) || allContent[0];
        const rawText = targetData.content;

        console.log(`[AudioInit] Initializing for Level ${currentLevel}`);

        console.log(`[AudioInit] Initializing for Level ${currentLevel}`);

        // 1. Use UniversalTokenizer for Single Source of Truth
        const tokenizer = new UniversalTokenizer(rawText);
        const segments = tokenizer.getSegments().map(s => ({
            text: s.text,
            isNewParagraph: s.isNewParagraph
        }));

        // 2. Generate optimized text for TTS (preserves \n between blocks)
        const fullText = tokenizer.getFullTextForTTS();

        // 3. Extract offsets for audio mapping using fullText
        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

        const sentenceOffsets: number[] = [];
        let currentOffset = 0;

        // We must mimic how fullText was built to track offsets exactly
        segments.forEach((seg, i) => {
            if (i > 0) {
                if (seg.isNewParagraph) {
                    currentOffset += 1; // '\n'
                } else {
                    // Check previous segment for space logic matching tokenizer
                    // This is risky if logic duplicates.
                    // Better: Tokenizer should return the offsets relative to its output TTS string!
                }
            }
            // Wait, let's keep it simple.
            // Rely on tokenizer's fullText and just re-segment it? 
            // That feels circular but safe if reliable.
        });

        // Robust Approach: 
        // Just use standard Intl.Segmenter on the final fullText.
        // Because that's what we did in the "Fix", and it worked.
        // The Tokenizer just ensures the *Construction* of fullText is correct (with \n).
        const reSegmented = Array.from(segmenter.segment(fullText));

        reSegmented.forEach(s => sentenceOffsets.push(s.index));

        console.log('[AudioInit] Sentences:', segments.length, '- Sample offsets:', sentenceOffsets.slice(0, 5));

        // 3. Update store
        setPlaylist(segments, fullText);

        // 4. Sync voice and trigger preload
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
