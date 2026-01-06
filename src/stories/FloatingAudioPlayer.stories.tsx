import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import FloatingAudioPlayer from '../components/FloatingAudioPlayer';
import { audioState, type AudioSegment } from '../lib/store/audioStore';

const meta: Meta<typeof FloatingAudioPlayer> = {
    title: 'Components/FloatingAudioPlayer',
    component: FloatingAudioPlayer,
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story) => (
            <div className="w-full h-screen bg-stone-200 relative p-8">
                <div className="absolute inset-0 flex items-center justify-center text-stone-400 pointer-events-none">
                    (Page Content Background)
                </div>
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof FloatingAudioPlayer>;

// MOCK DATA for the Store
const MOCK_PLAYLIST: AudioSegment[] = [
    { text: "This is the first paragraph of the article. It serves as an introduction to the topic at hand.", isNewParagraph: true },
    { text: "Here is the second paragraph. It delves deeper into the subject matter, exploring various nuances and details.", isNewParagraph: true },
    { text: "The third paragraph offers a different perspective, challenging the reader's assumptions with new evidence.", isNewParagraph: true },
    { text: "Finally, the conclusion wraps up the argument, summarizing the key points and offering a look ahead.", isNewParagraph: true }
];

const MOCK_FULL_TEXT = MOCK_PLAYLIST.map(s => s.text).join(' ');

export const Default: Story = {
    args: {
        title: "Demo Article Title",
    },
    render: (args) => {
        // Initialize store state for this story
        useEffect(() => {
            audioState.setKey('playlist', MOCK_PLAYLIST);
            audioState.setKey('fullText', MOCK_FULL_TEXT);
            audioState.setKey('currentIndex', 0);
            audioState.setKey('isPlaying', false);
            audioState.setKey('playbackRate', 1.0);
            audioState.setKey('isReady', true); // Simulate ready state
            // Reset on unmount
            return () => {
                audioState.setKey('playlist', []);
            };
        }, []);

        return <FloatingAudioPlayer {...args} />;
    }
};

export const PlayingState: Story = {
    args: {
        title: "Active Playing Demo",
    },
    render: (args) => {
        useEffect(() => {
            audioState.setKey('playlist', MOCK_PLAYLIST);
            audioState.setKey('fullText', MOCK_FULL_TEXT);
            audioState.setKey('currentIndex', 1); // Start at 2nd paragraph
            audioState.setKey('isPlaying', true);
            audioState.setKey('playbackRate', 1.25);
            audioState.setKey('isReady', true);
            return () => {
                audioState.setKey('playlist', []);
                audioState.setKey('isPlaying', false);
            };
        }, []);

        return <FloatingAudioPlayer {...args} />;
    }
};

