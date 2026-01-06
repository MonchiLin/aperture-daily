import { map } from 'nanostores';

export interface AudioSegment {
    text: string;
    isNewParagraph: boolean;
}

export interface AudioState {
    playlist: AudioSegment[];      // Array of text segments (sentences)
    fullText: string;              // Complete article text for TTS
    currentIndex: number;          // Current segment index
    charIndex: number;             // Current character index in fullText
    isPlaying: boolean;
    playbackRate: number;          // 0.75, 1.0, 1.25, 1.5
    isPreloading: boolean;         // True while preloading audio
    isReady: boolean;              // True when audio is ready to play
    voice: string;
}

export const audioState = map<AudioState>({
    playlist: [],
    fullText: '',
    currentIndex: 0,
    charIndex: -1, // -1 means no word highlighted
    isPlaying: false,
    playbackRate: 1.0,
    isPreloading: false,
    isReady: false,
    voice: 'en-US-GuyNeural'
});

// Actions
export const setVoice = (voice: string) => {
    audioState.setKey('voice', voice);
};

export const setPlaylist = (segments: AudioSegment[], fullText: string) => {
    // Basic validation to ensure no empty segments
    const clean = segments.filter(s => s.text.trim().length > 0);
    audioState.setKey('playlist', clean);
    audioState.setKey('fullText', fullText);
    audioState.setKey('currentIndex', 0);
    audioState.setKey('isPlaying', false);
    audioState.setKey('charIndex', -1);
    audioState.setKey('isReady', false);
};

export const setPlaybackRate = (rate: number) => {
    audioState.setKey('playbackRate', rate);
};

export const togglePlay = () => {
    const s = audioState.get();
    audioState.setKey('isPlaying', !s.isPlaying);
};
