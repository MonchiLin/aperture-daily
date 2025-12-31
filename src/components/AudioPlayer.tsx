import { CaretRightFilled, PauseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useStore } from '@nanostores/react';
import { useEffect, useRef, useCallback } from 'react';
import { audioState, setPlaybackRate, setVoice, togglePlay } from '../lib/store/audioStore';
import { EdgeTTSClient } from '../lib/tts/edge-client';
import AudioVisualizer from './AudioVisualizer';

export default function AudioPlayer() {
    const state = useStore(audioState);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const clientRef = useRef<EdgeTTSClient>(new EdgeTTSClient());
    const lastCharIndexRef = useRef<number>(-1);

    const { isPlaying, currentIndex, playlist, playbackRate, wordAlignments, isLoading, voice } = state;
    const currentText = playlist[currentIndex];

    // Initialize voice from storage
    useEffect(() => {
        try {
            const savedVoice = localStorage.getItem('luma-words_voice_preference');
            if (savedVoice) {
                setVoice(savedVoice);
            }
        } catch { /* ignore */ }
    }, []);

    // Update client voice when it changes
    useEffect(() => {
        clientRef.current = new EdgeTTSClient(voice);
    }, [voice]);

    // Fetch Audio Effect
    useEffect(() => {
        if (!currentText) return;

        let active = true;

        // Debounce fetch to avoid rapid state changes causing WebSocket spam
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

            if (state.audioUrl) {
                URL.revokeObjectURL(state.audioUrl);
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

    // Audio Element Management
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (state.audioUrl && audio.src !== state.audioUrl) {
            audio.src = state.audioUrl;
        }

        if (isPlaying && state.audioUrl && !isLoading) {
            audio.play().catch(e => {
                console.warn("Autoplay blocked or failed", e);
                audioState.setKey('isPlaying', false);
            });
        } else {
            audio.pause();
        }

        audio.playbackRate = playbackRate;
    }, [state.audioUrl, isPlaying, isLoading, playbackRate]);

    // Optimized Sync using timeupdate (fires ~4x per second, less CPU than RAF)
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
            // Only update if changed - prevents React re-renders
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

    if (playlist.length === 0) return null;

    const speeds = [0.75, 1, 1.25, 1.5];

    return (
        <div className="font-serif">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b-2 border-slate-900 pb-2">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-900">
                    Audio Edition
                </div>
                <div className="text-xs font-mono text-stone-500">
                    {playbackRate}x
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
                <button
                    onClick={togglePlay}
                    disabled={isLoading}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-900 !text-white hover:bg-slate-700 transition-all shrink-0 disabled:opacity-50"
                >
                    {isPlaying ? <PauseOutlined className="text-xl" /> : <CaretRightFilled className="text-xl ml-1" />}
                </button>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="text-sm font-bold text-slate-900 leading-none mb-1">
                        {isLoading ? 'Loading Audio...' : (isPlaying ? 'Now Playing' : 'Listen to Article')}
                    </div>
                    <div className="text-xs text-stone-500 font-serif italic truncate">
                        Section {currentIndex + 1} of {playlist.length}
                    </div>
                </div>

                <div className="flex gap-1">
                    <button
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-stone-300 text-stone-400 hover:text-slate-900 hover:border-slate-900 transition-all"
                        onClick={() => {
                            const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
                            setPlaybackRate(speeds[nextIdx]);
                        }}
                        title="Speed"
                    >
                        <span className="text-[10px] font-bold">SPD</span>
                    </button>
                    <button
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-stone-300 text-stone-400 hover:text-slate-900 hover:border-slate-900 transition-all"
                        onClick={() => {
                            audioState.setKey('currentIndex', 0);
                            audioState.setKey('isPlaying', false);
                            audioState.setKey('charIndex', -1);
                        }}
                        title="Restart"
                    >
                        <ReloadOutlined className="text-xs" />
                    </button>
                </div>
            </div>


            {/* Waveform (Extracted) */}
            <div className="mt-4 opacity-50">
                <AudioVisualizer isPlaying={isPlaying && !isLoading} />
            </div>

            {/* Hidden Audio Element */}
            <audio
                ref={audioRef}
                onTimeUpdate={onTimeUpdate}
                onEnded={onEnded}
                className="hidden"
            />
        </div>
    );
}
