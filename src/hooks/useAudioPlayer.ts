import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { audioState, setPlaybackRate, setVoice, togglePlay as storeTogglePlay } from '../lib/store/audioStore';
import { EdgeTTSClient } from '../lib/tts/edge-client';

const SPEEDS = [0.75, 1, 1.25, 1.5];
const VOICE_STORAGE_KEY = 'aperture-daily_voice_preference';
const LEGACY_VOICE_KEY = 'luma-words_voice_preference';

/**
 * 音频播放引擎 Hook
 * 负责处理 TTS 合成、音频生命周期、播放进度同步以及高亮对齐
 */
export function useAudioPlayer() {
    const state = useStore(audioState);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const clientRef = useRef<EdgeTTSClient>(new EdgeTTSClient());
    const lastCharIndexRef = useRef<number>(-1);

    const { isPlaying, currentIndex, playlist, playbackRate, wordAlignments, isLoading, voice, audioUrl } = state;
    const currentText = playlist[currentIndex];

    // 1. Initialize voice from storage (with legacy backup)
    useEffect(() => {
        try {
            const savedVoice = localStorage.getItem(VOICE_STORAGE_KEY) || localStorage.getItem(LEGACY_VOICE_KEY);
            if (savedVoice) {
                setVoice(savedVoice);
            }
        } catch { /* ignore */ }
    }, []);

    // 2. Update client voice when it changes
    useEffect(() => {
        clientRef.current = new EdgeTTSClient(voice);
    }, [voice]);

    // 3. Side Effect: Fetch Audio with Debouncing
    useEffect(() => {
        if (!currentText) return;

        let active = true;
        const timer = setTimeout(() => {
            const fetchAudio = async () => {
                audioState.setKey('isLoading', true);
                clientRef.current.cancel();

                try {
                    const result = await clientRef.current.synthesize(currentText, playbackRate);
                    if (active) {
                        const url = URL.createObjectURL(result.audioBlob);
                        audioState.setKey('audioUrl', url);
                        audioState.setKey('wordAlignments', result.wordBoundaries);
                        audioState.setKey('isLoading', false);
                        audioState.setKey('charIndex', -1);
                        lastCharIndexRef.current = -1;
                    }
                } catch (e) {
                    console.error("Audio fetch failed", e);
                    if (active) audioState.setKey('isLoading', false);
                }
            };

            if (audioUrl) {
                URL.revokeObjectURL(audioUrl);
                audioState.setKey('audioUrl', null);
                audioState.setKey('wordAlignments', []);
            }

            fetchAudio();
        }, 300);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [currentIndex, currentText, playbackRate, voice]);

    // 4. Side Effect: Sync Audio Element
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (audioUrl && audio.src !== audioUrl) {
            audio.src = audioUrl;
        }

        if (isPlaying && audioUrl && !isLoading) {
            audio.play().catch(e => {
                console.warn("Autoplay blocked or failed", e);
                audioState.setKey('isPlaying', false);
            });
        } else {
            audio.pause();
        }

        audio.playbackRate = playbackRate;
    }, [audioUrl, isPlaying, isLoading, playbackRate]);

    // 5. Binary Search Sync (Optimized for timeupdate)
    const onTimeUpdate = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !wordAlignments.length) return;

        const timeMs = audio.currentTime * 1000;

        // Binary search for active word
        let l = 0, r = wordAlignments.length - 1;
        let idx = -1;

        while (l <= r) {
            const mid = Math.floor((l + r) / 2);
            if (wordAlignments[mid].audioOffset <= timeMs) {
                idx = mid;
                l = mid + 1;
            } else {
                r = mid - 1;
            }
        }

        if (idx !== -1) {
            const word = wordAlignments[idx];
            if (lastCharIndexRef.current !== word.textOffset) {
                lastCharIndexRef.current = word.textOffset;
                audioState.setKey('charIndex', word.textOffset);
            }
        }
    }, [wordAlignments]);

    const onEnded = useCallback(() => {
        if (currentIndex < playlist.length - 1) {
            audioState.setKey('currentIndex', currentIndex + 1);
        } else {
            audioState.setKey('isPlaying', false);
            audioState.setKey('currentIndex', 0);
            audioState.setKey('charIndex', -1);
        }
    }, [currentIndex, playlist.length]);

    // 6. Action Wrappers
    const togglePlay = useCallback(() => storeTogglePlay(), []);

    const nextSpeed = useCallback(() => {
        const nextIdx = (SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length;
        setPlaybackRate(SPEEDS[nextIdx]);
    }, [playbackRate]);

    const restart = useCallback(() => {
        audioState.setKey('currentIndex', 0);
        audioState.setKey('isPlaying', false);
        audioState.setKey('charIndex', -1);
    }, []);

    return {
        state,
        audioRef,
        onTimeUpdate,
        onEnded,
        togglePlay,
        nextSpeed,
        restart
    };
}
