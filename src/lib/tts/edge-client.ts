import { apiFetch } from '../api';
import type { TTSResult, WordBoundary } from './types';

export class EdgeTTSClient {
    private readonly voice: string;

    // static reference to currently playing audio for single-instance playback
    private static currentAudio: HTMLAudioElement | null = null;

    constructor(voice: string = "en-US-GuyNeural") {
        this.voice = voice;
    }

    /**
     * Synthesize text to speech via Backend Proxy (GET method)
     * Supports either direct text synthesis OR server-side article fetching
     */
    async synthesize(text: string, rate: number = 1.0, options?: { articleId?: string, level?: number }): Promise<TTSResult> {
        try {
            // Build query params
            const params = new URLSearchParams();
            params.set('voice', this.voice);
            params.set('rate', rate.toString());

            if (options?.articleId && options?.level) {
                params.set('articleId', options.articleId);
                params.set('level', options.level.toString());
                // When using articleId, 'text' parameter is ignored by server logic, 
                // but we might still have it locally for offset calculation if needed?
                // Actually, if we use articleId, the server returns the audio for that article.
                // The 'text' argument here in the client might be the fullText passed by audioPreloader.
                // We keep it in the loop for the OFFSET CALCULATION below.
            } else {
                params.set('text', text);
            }

            // Call backend proxy via GET
            const response = await apiFetch<{ audio: string; boundaries: any[] }>(`/api/tts?${params.toString()}`, {
                method: 'GET'
            });

            // Decode Base64 audio to Blob
            const binaryString = atob(response.audio);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'audio/mpeg' });

            // Process boundaries
            const boundaries: WordBoundary[] = [];
            let lastTextOffset = 0;
            const rawBoundaries = response.boundaries || [];

            // If we fetched the article from server, 'text' might be empty or different?
            // audioPreloader passes the fullText it has locally.
            // We assume local text == server text (which should be true if data is consistent).
            // If text is NOT provided (e.g. some future call), we can't calculate textOffset easily 
            // without fetching the text back. 
            // Ideally server returns the text too? 
            // For now, we assume the caller provided the matching text locally.

            for (const b of rawBoundaries) {
                const wordText = b.text;

                // Manual Offset Calculation
                let currentOffset = lastTextOffset;
                if (wordText && text) {
                    const searchStart = lastTextOffset;
                    const foundIndex = text.toLowerCase().indexOf(wordText.toLowerCase(), searchStart);

                    if (foundIndex !== -1) {
                        currentOffset = foundIndex;
                        lastTextOffset = foundIndex + wordText.length;
                    }
                }

                boundaries.push({
                    audioOffset: b.offset / 10000,
                    duration: b.duration / 10000,
                    text: wordText,
                    textOffset: currentOffset,
                    wordLength: wordText ? wordText.length : 0
                });
            }

            return {
                audioBlob: blob,
                wordBoundaries: boundaries
            };

        } catch (e) {
            console.error("TTS Proxy Error:", e);
            throw e;
        }
    }

    cancel() {
        // no-op
    }

    /**
     * Helper to play text directly (uses text-based synthesis)
     */
    static async play(text: string, voice?: string): Promise<void> {
        if (EdgeTTSClient.currentAudio) {
            EdgeTTSClient.currentAudio.pause();
            EdgeTTSClient.currentAudio.currentTime = 0;
            EdgeTTSClient.currentAudio = null;
        }

        const client = new EdgeTTSClient(voice);
        const result = await client.synthesize(text); // Default: sends text param
        const audioUrl = URL.createObjectURL(result.audioBlob);
        const audio = new Audio(audioUrl);

        EdgeTTSClient.currentAudio = audio;

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                URL.revokeObjectURL(audioUrl);
                if (EdgeTTSClient.currentAudio === audio) {
                    EdgeTTSClient.currentAudio = null;
                }
            };
            audio.onended = () => { cleanup(); resolve(); };
            audio.onerror = (e) => { cleanup(); reject(e); };
            audio.play().catch((e) => {
                cleanup();
                if (e.name !== 'AbortError') reject(e);
            });
        });
    }
}
