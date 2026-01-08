import type { Meta } from '@storybook/react';

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
