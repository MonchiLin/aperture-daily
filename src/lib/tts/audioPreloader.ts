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
 * Now supports server-side fetching via articleId
 */
export async function preloadArticleAudio(
    fullText: string,
    level: number,
    sentenceOffsets: number[],
    articleId: string,
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

            // Use server-side fetch via articleId + level
            const result = await client.synthesize(fullText, 1.0, {
                articleId,
                level
            });

            const boundaries = result.wordBoundaries;

            // Calculate total duration from the last boundary if available
            const totalDuration = boundaries.length > 0
                ? (boundaries[boundaries.length - 1].audioOffset +
                    boundaries[boundaries.length - 1].duration) / 1000
                : 0;

            // 3. Match sentence offsets to word boundaries for PRECISE timing
            // instead of estimating based on character ratio.
            const sentenceAudioTimes = sentenceOffsets.map((sentenceStartChar, _idx) => {
                // Heuristic: Limit search to a window to prevent matching "phantom" words far away
                // (e.g. prevents jumping to end of article due to weird duplicate word match)
                const SEARCH_WINDOW = 500;

                // Filter boundaries to those reasonably close to the target text offset
                const candidates = boundaries.filter(b => Math.abs(b.textOffset - sentenceStartChar) < SEARCH_WINDOW);

                // If no local candidates (unlikely), fallback to all boundaries or previous time
                const searchSet = candidates.length > 0 ? candidates : boundaries;

                // Find the word boundary that is closest to the sentence start
                const matchedStats = searchSet.reduce((best, current) => {
                    const dist = Math.abs(current.textOffset - sentenceStartChar);
                    if (dist < best.dist) {
                        return { dist, time: current.audioOffset };
                    }
                    return best;
                }, { dist: Infinity, time: 0 }); // Default fallback to 0

                return matchedStats.time / 1000; // Convert ms to seconds
            });

            console.log('[AudioPreloader] Precise Sentence Times (s):', sentenceAudioTimes.slice(0, 5));

            cachedAudio = {
                url: URL.createObjectURL(result.audioBlob),
                alignments: boundaries,
                fullText,
                level,
                sentenceOffsets,
                sentenceAudioTimes, // Exact times in Seconds
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
