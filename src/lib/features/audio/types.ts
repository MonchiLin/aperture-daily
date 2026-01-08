export interface WordBoundary {
    audioOffset: number; // microseconds
    duration: number;    // microseconds
    text: string;
    textOffset: number;
    wordLength: number;
}

export interface TTSResult {
    audioBlob: Blob;
    wordBoundaries: WordBoundary[];
}

export interface TTSConfig {
    voice: string;
    rate?: number; // 0.5 to 2.0
    volume?: number; // 0.0 to 1.0
}

export type TTSVoice = 'en-US-GuyNeural' | 'en-US-JennyNeural' | 'en-US-AnaNeural' | 'en-US-AriaNeural';
