import type { Meta, StoryObj } from '@storybook/react';
import OnboardingDiegetic from '../components/onboarding/OnboardingDiegetic';

// Mock setup status
const issueStatus = {
    isSetup: false,
    missing: ['GEMINI_API_KEY'],
    provider: 'gemini' as const,
    dbStatus: 'ok' as const,
};

const databaseErrorStatus = {
    isSetup: false,
    missing: [],
    provider: null,
    dbStatus: 'error' as const,
};

const successStatus = {
    isSetup: true,
    missing: [],
    provider: 'gemini' as const,
    dbStatus: 'ok' as const,
};

const meta: Meta<typeof OnboardingDiegetic> = {
    title: 'Onboarding/Diegetic (The Silent Edition)',
    component: OnboardingDiegetic,
    parameters: {
        layout: 'fullscreen',
    },
    args: {
        loading: false,
    },
    argTypes: {
        onRecheck: { action: 'rechecked' },
        onComplete: { action: 'completed' }
    }
};

export default meta;
type Story = StoryObj<typeof OnboardingDiegetic>;

// 1. The Broken Configuration
export const PressStopped_ConfigIssue: Story = {
    args: {
        status: issueStatus
    }
};

// 2. Database Failure
export const PressStopped_DatabaseFail: Story = {
    args: {
        status: databaseErrorStatus
    }
};

// 3. Success / Ready to Print
export const ReadyToPrint: Story = {
    args: {
        status: successStatus
    }
};

// 4. Loading State
export const Retrying: Story = {
    args: {
        status: issueStatus,
        loading: true
    }
};
