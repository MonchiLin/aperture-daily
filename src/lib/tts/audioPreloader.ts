/**
 * Audio Preloader
 * 
 * Handles whole-article TTS synthesis and caching.
 * Auto-preloads on page load and level change for seamless playback.
 */

import { EdgeTTSClient } from './edge-client';
import type { WordBoundary } from './types';

export interface PreloadedAudio {
    url: string;
    alignments: WordBoundary[];
    fullText: string;
    level: number;
    /** Sentence start offsets in fullText (character positions) */
    sentenceOffsets: number[];
    /** Sentence audio start times (in seconds) */
    sentenceAudioTimes: number[];
    /** Total audio duration in seconds */
    duration: number;
}

// Singleton cache
let cachedAudio: PreloadedAudio | null = null;
let preloadingPromise: Promise<void> | null = null;
let currentVoice = 'en-US-GuyNeural';

export function getCachedAudio(): PreloadedAudio | null {
    return cachedAudio;
}

export function isPreloading(): boolean {
    return preloadingPromise !== null;
}

export function setPreloaderVoice(voice: string) {
    currentVoice = voice;
}

export function clearCache() {
    if (cachedAudio) {
        URL.revokeObjectURL(cachedAudio.url);
        cachedAudio = null;
    }
    preloadingPromise = null;
}

/**
 * Preload entire article audio
 */
export async function preloadArticleAudio(
    fullText: string,
    level: number,
    sentenceOffsets: number[],
    onProgress?: (loading: boolean) => void
): Promise<PreloadedAudio | null> {
    if (cachedAudio && cachedAudio.level === level && cachedAudio.fullText === fullText) {
        console.log('[AudioPreloader] Using cached audio for level', level);
        return cachedAudio;
    }

    if (preloadingPromise) {
        console.log('[AudioPreloader] Preload in progress, waiting...');
        await preloadingPromise;
        return cachedAudio;
    }

    clearCache();
    console.log('[AudioPreloader] Starting preload for level', level);
    onProgress?.(true);

    preloadingPromise = (async () => {
        try {
            const client = new EdgeTTSClient(currentVoice);
            const result = await client.synthesize(fullText, 1.0);

            // Calculate sentence audio times based on character ratio
            // This is more reliable than textOffset matching
            const totalChars = fullText.length;
            const totalDuration = result.wordBoundaries.length > 0
                ? (result.wordBoundaries[result.wordBoundaries.length - 1].audioOffset +
                    result.wordBoundaries[result.wordBoundaries.length - 1].duration) / 1000
                : 0;

            const sentenceAudioTimes = sentenceOffsets.map(offset => {
                // Estimate audio time based on character position ratio
                return (offset / totalChars) * totalDuration;
            });

            cachedAudio = {
                url: URL.createObjectURL(result.audioBlob),
                alignments: result.wordBoundaries,
                fullText,
                level,
                sentenceOffsets,
                sentenceAudioTimes,
                duration: totalDuration
            };

            console.log('[AudioPreloader] Preload complete. Duration:', totalDuration.toFixed(2), 's');

        } catch (error) {
            console.error('[AudioPreloader] Preload failed:', error);
            cachedAudio = null;
        } finally {
            preloadingPromise = null;
            onProgress?.(false);
        }
    })();

    await preloadingPromise;
    return cachedAudio;
}

/**
 * Get audio offset (in seconds) for a given sentence index
 */
export function getSentenceAudioOffset(sentenceIndex: number): number {
    if (!cachedAudio || sentenceIndex < 0 || sentenceIndex >= cachedAudio.sentenceAudioTimes.length) {
        return 0;
    }
    return cachedAudio.sentenceAudioTimes[sentenceIndex];
}

/**
 * Find which sentence is playing based on current audio time
 */
export function getSentenceIndexAtTime(currentTimeSeconds: number): number {
    if (!cachedAudio || cachedAudio.sentenceAudioTimes.length === 0) {
        return 0;
    }

    const times = cachedAudio.sentenceAudioTimes;

    // Binary search for the sentence containing this time
    let l = 0, r = times.length - 1;

    while (l < r) {
        const mid = Math.floor((l + r + 1) / 2);
        if (times[mid] <= currentTimeSeconds) {
            l = mid;
        } else {
            r = mid - 1;
        }
    }

    return l;
}
