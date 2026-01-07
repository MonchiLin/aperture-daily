import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { audioState, type AudioSegment } from '../lib/store/audioStore';

const meta: Meta = {
    title: 'Prototypes/AudioPlayerInteractions',
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story) => (
            <div className="w-full h-screen bg-stone-200 relative p-8 font-sans">
                <div className="absolute inset-0 flex items-center justify-center text-stone-400 pointer-events-none">
                    <span className="text-4xl font-bold opacity-10">INTERACTION LAB</span>
                </div>
                <Story />
            </div>
        ),
    ],
};

export default meta;

// MOCK DATA
const MOCK_PLAYLIST: AudioSegment[] = [
    { text: "This is Demo Content Paragraph 1. The interaction feels fluid like water.", isNewParagraph: true },
    { text: "Paragraph 2 explores the physics of the spring animation. Notice the bounce.", isNewParagraph: true },
    { text: "Finally, Paragraph 3 tests the scrolling and layout stability during expansion.", isNewParagraph: true }
]
const MOCK_FULL_TEXT = MOCK_PLAYLIST.map(s => s.text).join(' ');

// SHARED RENDER LOGIC
const renderWithState = (Component: React.ComponentType) => {
    return () => {
        useEffect(() => {
            audioState.setKey('playlist', MOCK_PLAYLIST);
            audioState.setKey('fullText', MOCK_FULL_TEXT);
            audioState.setKey('currentIndex', 0);
            return () => { audioState.setKey('playlist', []); };
        }, []);
        return <Component />;
    };
};
