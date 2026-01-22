import type { Meta, StoryObj } from '@storybook/react';
import { ImpressionLayoutV3 } from './ImpressionLayoutV3';

const meta: Meta<typeof ImpressionLayoutV3> = {
    title: 'Impression/V3 - Cinema',
    component: ImpressionLayoutV3,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof ImpressionLayoutV3>;

export const Default: Story = {};
