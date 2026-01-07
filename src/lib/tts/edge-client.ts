import { v4 as uuidv4 } from 'uuid';
import type { TTSResult, WordBoundary } from './types';

const EDGE_TTS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

export class EdgeTTSClient {
    private ws: WebSocket | null = null;
    private readonly voice: string;

    constructor(voice: string = "en-US-GuyNeural") {
        this.voice = voice;
    }

    /**
     * Synthesize text to speech
     */
    async synthesize(text: string, rate: number = 1.0): Promise<TTSResult> {
        return new Promise((resolve, reject) => {
            const requestId = uuidv4().replace(/-/g, '');
            let hasResolved = false;

            try {
                this.ws = new WebSocket(EDGE_TTS_URL);
            } catch (e) {
                return reject(e);
            }

            const audioData: ArrayBuffer[] = [];
            const boundaries: WordBoundary[] = [];

            const cleanup = () => {
                if (this.ws) {
                    this.ws.onclose = null;
                    this.ws.onerror = null;
                    this.ws.onmessage = null;
                    this.ws.onopen = null;
                    if (this.ws.readyState === WebSocket.OPEN) {
                        this.ws.close();
                    }
                    this.ws = null;
                }
            };

            const finish = () => {
                if (hasResolved) return;
                hasResolved = true;
                cleanup();
                const blob = new Blob(audioData, { type: 'audio/mpeg' });
                resolve({ audioBlob: blob, wordBoundaries: boundaries });
            };

            const fail = (err: any) => {
                if (hasResolved) return;
                hasResolved = true;
                cleanup();
                reject(err);
            };

            this.ws.onopen = () => {
                try {
                    const configData = {
                        context: {
                            synthesis: {
                                audio: {
                                    activityDetection: false,
                                    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                                    metadataOptions: {
                                        sentenceBoundaryEnabled: "false",
                                        wordBoundaryEnabled: "true"
                                    },
                                    volume: 1.0,
                                    rate: "default"
                                }
                            }
                        }
                    };

                    // 1. Send Config
                    const configMessage = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(configData)}`;
                    this.ws?.send(configMessage);

                    // 2. Send SSML
                    const ratePct = rate === 1.0 ? "default" : `${Math.round((rate - 1) * 100)}%`;

                    // Escape XML chars in text clearly
                    const safeText = text
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&apos;');

                    const ssml = `
                <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
                    <voice name='${this.voice}'>
                        <prosody rate='${ratePct}' pitch='default'>
                            ${safeText}
                        </prosody>
                    </voice>
                </speak>
                `.trim();

                    const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}\r\nPath:ssml\r\n\r\n${ssml}`;
                    this.ws?.send(ssmlMessage);
                    console.log("[EdgeTTS] Request sent", requestId);
                } catch (e) {
                    console.error("[EdgeTTS] Setup error", e);
                    fail(e);
                }
            };

            this.ws.onmessage = async (event) => {
                const data = event.data;

                if (typeof data === 'string') {
                    // Text Frame
                    if (data.includes("Path:audio.metadata")) {
                        const jsonStart = data.indexOf("{");
                        if (jsonStart !== -1) {
                            try {
                                const json = JSON.parse(data.substring(jsonStart));
                                if (json.Metadata && Array.isArray(json.Metadata)) {
                                    // console.log("[EdgeTTS] Metadata array length:", json.Metadata.length);
                                    let lastTextOffset = 0;
                                    for (const meta of json.Metadata) {
                                        if (meta.Type === "WordBoundary") {
                                            const d = meta.Data;
                                            const textObj = d.text;
                                            const wordText = textObj ? (textObj.Text || textObj.text || "") : "";

                                            // Manual Offset Calculation
                                            // Search for the word in the original text to find its character index
                                            let currentOffset = lastTextOffset;
                                            if (wordText) {
                                                // Case-insensitive match to be robust
                                                const searchStart = lastTextOffset;
                                                const lowerText = text.toLowerCase();
                                                const lowerWord = wordText.toLowerCase();
                                                const foundIndex = lowerText.indexOf(lowerWord, searchStart);

                                                if (foundIndex !== -1) {
                                                    currentOffset = foundIndex;
                                                    // Move pointer past this word
                                                    lastTextOffset = foundIndex + wordText.length;
                                                } else {
                                                    // console.warn(`[EdgeTTS] Word "${wordText}" not found after offset ${searchStart}`);
                                                }
                                            }

                                            boundaries.push({
                                                audioOffset: d.Offset / 10000,
                                                duration: d.Duration / 10000,
                                                text: wordText,
                                                textOffset: currentOffset,
                                                wordLength: textObj ? (textObj.Length ?? wordText.length) : wordText.length
                                            });
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn("[EdgeTTS] Metadata parse error", e);
                            }
                        }
                    } else if (data.includes("Path:turn.end")) {
                        finish();
                    }
                } else if (data instanceof Blob) {
                    // Binary Frame (Audio)
                    // The binary message has a 2-byte header indicating the length of the string header (RequestId etc)
                    // We need to skip it to get pure audio bytes.
                    try {
                        const buffer = await data.arrayBuffer();
                        const view = new DataView(buffer);
                        const headLength = view.getUint16(0);
                        const audioPart = buffer.slice(headLength + 2);
                        audioData.push(audioPart);
                    } catch (e) {
                        fail(e);
                    }
                }
            };

            this.ws.onerror = (e) => {
                fail(e);
            };

            this.ws.onclose = (e) => {
                if (e.code !== 1000 && e.code !== 1005) {
                    fail(new Error(`WebSocket closed unexpectedly: ${e.code}`));
                } else {
                    finish();
                }
            };
        });
    }

    cancel() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Helper to play text directly
     */
    static async play(text: string): Promise<void> {
        const client = new EdgeTTSClient();
        const result = await client.synthesize(text);
        const audioUrl = URL.createObjectURL(result.audioBlob);
        const audio = new Audio(audioUrl);

        return new Promise((resolve, reject) => {
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                resolve();
            };
            audio.onerror = (e) => {
                URL.revokeObjectURL(audioUrl);
                reject(e);
            };

            audio.play().catch((e) => {
                URL.revokeObjectURL(audioUrl);
                reject(e);
            });
        });
    }
}
