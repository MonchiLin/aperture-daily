import { v4 as uuidv4 } from 'uuid';

export interface WordBoundary {
    audioOffset: number; // Time in microseconds (10^-7 seconds usually, or ms depending on returning format)
    duration: number;
    text: string;
    textOffset: number;
    wordLength: number;
}

export interface TTSResult {
    audioBlob: Blob;
    wordBoundaries: WordBoundary[];
}

const EDGE_TTS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

export class EdgeTTSClient {
    private ws: WebSocket | null = null;

    // Voices: en-US-GuyNeural (Male), en-US-JennyNeural (Female), en-US-AnaNeural (Female, Childish?)
    // Provide a default
    constructor(public readonly voice: string = "en-US-GuyNeural") { }

    /**
     * Synthesize text to speech
     * Returns a Promise that resolves with the Audio Blob and Word Alignment Data
     */
    async synthesize(text: string, rate: number = 1.0): Promise<TTSResult> {
        return new Promise((resolve, reject) => {
            const requestId = uuidv4().replace(/-/g, '');

            // Use default binaryType (Blob) to ensure Text frames are strings
            this.ws = new WebSocket(EDGE_TTS_URL);

            const audioData: ArrayBuffer[] = [];
            let boundaries: WordBoundary[] = [];

            this.ws.onopen = () => {
                const configData = {
                    context: {
                        synthesis: {
                            audio: {
                                activityDetection: false,
                                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
                                // Explicit property, no getter
                                metadataoptions: {
                                    "sentenceBoundaryEnabled": "false",
                                    "wordBoundaryEnabled": "true",
                                    "WordBoundaryEnabled": "true"
                                },
                                volume: 1.0,
                                rate: "default"
                            }
                        }
                    }
                };

                const configMessage = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(configData)}`;
                this.ws?.send(configMessage);

                const ratePct = rate === 1.0 ? "default" : `${Math.round((rate - 1) * 100)}%`;

                const ssml = `
                <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
                    <voice name='${this.voice}'>
                        <prosody rate='${ratePct}' pitch='default'>
                            ${text}
                        </prosody>
                    </voice>
                </speak>
                `.trim();

                const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}\r\nPath:ssml\r\n\r\n${ssml}`;
                this.ws?.send(ssmlMessage);
            };

            this.ws.onmessage = async (event) => {
                const data = event.data;

                if (typeof data === 'string') {
                    // Text Frame: Metadata
                    if (data.includes("Path:audio.metadata")) {
                        const jsonStart = data.indexOf("{");
                        if (jsonStart !== -1) {
                            try {
                                const json = JSON.parse(data.substring(jsonStart));
                                if (json.Metadata && Array.isArray(json.Metadata)) {
                                    json.Metadata.forEach((meta: any) => {
                                        if (meta.Type === "WordBoundary") {
                                            boundaries.push({
                                                audioOffset: meta.Data.Offset / 10000,
                                                duration: meta.Data.Duration / 10000,
                                                text: meta.Data.text.text,
                                                textOffset: meta.Data.text.Offset,
                                                wordLength: meta.Data.text.Length
                                            });
                                        }
                                    });
                                }
                            } catch (e) {
                                console.error("Error parsing metadata", e);
                                reject(e);
                                this.ws?.close();
                            }
                        }
                    } else if (data.includes("Path:turn.end")) {
                        this.ws?.close();
                    }
                } else if (data instanceof Blob) {
                    // Binary Frame: Audio (received as Blob by default)
                    try {
                        const buffer = await data.arrayBuffer();
                        const view = new DataView(buffer);
                        const headLength = view.getUint16(0);
                        const audioPart = buffer.slice(headLength + 2);
                        audioData.push(audioPart);
                    } catch (e) {
                        console.error("Error processing audio blob", e);
                        reject(e);
                        this.ws?.close();
                    }
                }
            };

            this.ws.onclose = () => {
                const blob = new Blob(audioData, { type: 'audio/mpeg' });
                // console.log(`[EdgeTTS] Finished. Audio: ${blob.size}b, Boundaries: ${boundaries.length}`);
                resolve({ audioBlob: blob, wordBoundaries: boundaries });
            };

            this.ws.onerror = (e) => {
                console.error("[EdgeTTS] WebSocket Error:", e);
                reject(e);
            };
        });
    }
}
