import type { Meta, StoryObj } from '@storybook/react';
import { PlaybackSpeedControl } from '../components/PlaybackSpeedControl';
import { useState } from 'react';

const meta = {
    title: 'Components/PlaybackSpeedControl',
    component: PlaybackSpeedControl,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof PlaybackSpeedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wrapper to handle state in Storybook
const PlaybackSpeedControlWrapper = () => {
    const [speed, setSpeed] = useState(1);
    return (
        <div className="h-64 flex items-start justify-center p-4 bg-stone-50 rounded-xl border border-dashed border-stone-200">
            <PlaybackSpeedControl
                currentSpeed={speed}
                onSpeedChange={setSpeed}
            />
        </div>
    );
};

export const Default: Story = {
    render: () => <PlaybackSpeedControlWrapper />,
};

export const StaticStates: Story = {
    render: () => (
        <div className="flex gap-8">
            <PlaybackSpeedControl currentSpeed={1} onSpeedChange={() => { }} />
            <PlaybackSpeedControl currentSpeed={1.5} onSpeedChange={() => { }} />
            <PlaybackSpeedControl currentSpeed={2} onSpeedChange={() => { }} />
        </div>
    )
};
