import type { Meta, StoryObj } from '@storybook/react';
import { ImpressionLayoutV2 } from './ImpressionLayoutV2';

const meta: Meta<typeof ImpressionLayoutV2> = {
    title: 'Impression/V2 - Marginalia',
    component: ImpressionLayoutV2,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof ImpressionLayoutV2>;

export const Default: Story = {};
