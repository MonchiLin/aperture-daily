import type { Meta, StoryObj } from '@storybook/react';
import { ImpressionLayoutV1 } from './ImpressionLayoutV1';

const meta: Meta<typeof ImpressionLayoutV1> = {
    title: 'Impression/V1 - Dashboard',
    component: ImpressionLayoutV1,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof ImpressionLayoutV1>;

export const Default: Story = {};
