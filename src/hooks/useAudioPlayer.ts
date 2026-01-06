import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { audioState, setPlaybackRate, setVoice, togglePlay as storeTogglePlay } from '../lib/store/audioStore';
import { getCachedAudio, getSentenceAudioOffset, getSentenceIndexAtTime, setPreloaderVoice } from '../lib/tts/audioPreloader';

const SPEEDS = [0.75, 1, 1.25, 1.5];
const VOICE_STORAGE_KEY = 'aperture-daily_voice_preference';

/**
 * Audio Player Engine Hook
 * 
 * Uses preloaded whole-article audio with time-based sentence tracking.
 */
export function useAudioPlayer() {
    const state = useStore(audioState);
    const { isPlaying, currentIndex, playlist, playbackRate, isReady, voice } = state;

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastSentenceIndexRef = useRef<number>(-1);

    // Flag to track if seek was triggered by user action
    const userSeekRef = useRef<boolean>(false);

    // 1. Initialize voice from storage
    useEffect(() => {
        try {
            const savedVoice = localStorage.getItem(VOICE_STORAGE_KEY);
            if (savedVoice) {
                setVoice(savedVoice);
                setPreloaderVoice(savedVoice);
            }
        } catch { /* ignore */ }
    }, []);

    // 2. Update preloader voice when it changes
    useEffect(() => {
        setPreloaderVoice(voice);
    }, [voice]);

    // 3. Sync audio source from preloaded cache
    useEffect(() => {
        const audio = audioRef.current;
        const cached = getCachedAudio();

        if (!audio || !cached || !isReady) return;

        if (audio.src !== cached.url) {
            audio.src = cached.url;
            console.log('[useAudioPlayer] Audio source set from cache');
        }
    }, [isReady]);

    // 4. Control playback state
    useEffect(() => {
        const audio = audioRef.current;
        const cached = getCachedAudio();

        if (!audio || !cached || !isReady) return;

        if (isPlaying) {
            audio.play().catch(e => {
                console.warn('Autoplay blocked or failed', e);
                audioState.setKey('isPlaying', false);
            });
        } else {
            audio.pause();
        }

        audio.playbackRate = playbackRate;
    }, [isPlaying, isReady, playbackRate]);

    // 5. Handle USER-triggered sentence change - seek to correct position
    useEffect(() => {
        if (!userSeekRef.current) return;

        const audio = audioRef.current;
        if (!audio || !isReady) return;

        const offset = getSentenceAudioOffset(currentIndex);
        audio.currentTime = offset;
        console.log('[useAudioPlayer] User seeked to sentence', currentIndex, 'at', offset.toFixed(2), 's');

        // Dispatch event immediately for instant UI feedback
        // This is needed because onTimeUpdate will skip dispatching since lastSentenceIndexRef is already updated
        window.dispatchEvent(new CustomEvent('audio-sentence-change', {
            detail: { sentenceIndex: currentIndex, isPlaying: true }
        }));

        userSeekRef.current = false;
    }, [currentIndex, isReady]);

    // 6. Time update handler - update sentence index based on audio time
    const onTimeUpdate = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const currentTime = audio.currentTime;
        const sentenceIdx = getSentenceIndexAtTime(currentTime);

        // Only update if changed and not during user seek
        if (sentenceIdx !== lastSentenceIndexRef.current && !userSeekRef.current) {
            lastSentenceIndexRef.current = sentenceIdx;
            audioState.setKey('currentIndex', sentenceIdx);

            // Dispatch event to sync article highlighting
            window.dispatchEvent(new CustomEvent('audio-sentence-change', {
                detail: { sentenceIndex: sentenceIdx, isPlaying: true }
            }));
        }
    }, []);

    // 7. Handle audio end
    const onEnded = useCallback(() => {
        audioState.setKey('isPlaying', false);
        audioState.setKey('currentIndex', 0);
        lastSentenceIndexRef.current = -1;

        // Clear article highlight
        window.dispatchEvent(new CustomEvent('audio-sentence-change', {
            detail: { sentenceIndex: -1, isPlaying: false }
        }));
    }, []);

    // 8. Action wrappers
    const togglePlay = useCallback(() => storeTogglePlay(), []);

    const nextSpeed = useCallback(() => {
        const nextIdx = (SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length;
        setPlaybackRate(SPEEDS[nextIdx]);
    }, [playbackRate]);

    const restart = useCallback(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.currentTime = 0;
        }
        audioState.setKey('currentIndex', 0);
        audioState.setKey('isPlaying', false);
        lastSentenceIndexRef.current = -1;
    }, []);

    // 9. Jump to specific sentence (USER action - will trigger seek)
    const jumpToSentence = useCallback((index: number) => {
        if (index >= 0 && index < playlist.length) {
            userSeekRef.current = true;
            lastSentenceIndexRef.current = index;
            audioState.setKey('currentIndex', index);
            audioState.setKey('isPlaying', true);
        }
    }, [playlist.length]);

    return {
        state,
        audioRef,
        onTimeUpdate,
        onEnded,
        togglePlay,
        nextSpeed,
        restart,
        jumpToSentence
    };
}
