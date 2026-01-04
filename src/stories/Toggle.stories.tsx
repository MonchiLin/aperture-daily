import type { Meta, StoryObj } from '@storybook/react';
import Toggle from '../components/ui/Toggle';
import { useState } from 'react';

const meta: Meta<typeof Toggle> = {
    title: 'UI/Toggle',
    component: Toggle,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Toggle>;

export const Default: Story = {
    args: {
        checked: false,
        label: 'Auto Copy',
    },
    render: (args) => {
        const [checked, setChecked] = useState(args.checked);
        return <Toggle {...args} checked={checked} onChange={setChecked} />;
    }
};

export const Active: Story = {
    args: {
        checked: true,
        label: 'Auto Copy',
    },
    render: (args) => {
        const [checked, setChecked] = useState(args.checked);
        return <Toggle {...args} checked={checked} onChange={setChecked} />;
    }
};

export const Disabled: Story = {
    args: {
        checked: false,
        disabled: true,
        label: 'Disabled Toggle',
    },
};

export const DisabledActive: Story = {
    args: {
        checked: true,
        disabled: true,
        label: 'Disabled Active Toggle',
    },
};
