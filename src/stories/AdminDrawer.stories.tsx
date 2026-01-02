/**
 * AdminDrawer Storybook Stories
 * 
 * 展示 MANAGE 按钮的不同状态指示器效果。
 */
import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { Settings } from 'lucide-react';
import { isAdminStore, taskStatusStore, type TaskStatus } from '../lib/store/adminStore';

// 状态指示器独立组件（用于 Story）
function StatusIndicatorButton({ status }: { status: TaskStatus }) {
    // 设置 store 状态
    useEffect(() => {
        isAdminStore.set(true);
        taskStatusStore.set(status);
    }, [status]);

    const statusIndicator = status.hasFailed ? (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="有失败任务" />
    ) : (status.hasRunning || status.hasQueued) ? (
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" title="有进行中任务" />
    ) : null;

    return (
        <button className="flex items-center gap-1 text-[10px] font-bold tracking-[0.15em] uppercase text-amber-600 hover:text-amber-700 transition-colors cursor-pointer">
            <Settings size={12} />
            MANAGE
            {statusIndicator}
        </button>
    );
}

const meta = {
    title: 'Components/AdminDrawer',
    component: StatusIndicatorButton,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        backgrounds: {
            default: 'paper',
            values: [
                { name: 'paper', value: '#F9F9F8' },
                { name: 'white', value: '#ffffff' },
            ],
        },
    },
} satisfies Meta<typeof StatusIndicatorButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// 默认状态 - 无活跃任务
export const Default: Story = {
    args: {
        status: { hasRunning: false, hasFailed: false, hasQueued: false }
    },
    render: (args) => (
        <div className="p-8">
            <p className="text-xs text-stone-500 mb-4">无活跃任务</p>
            <StatusIndicatorButton {...args} />
        </div>
    ),
};

// 运行中 - 橙色脉冲
export const Running: Story = {
    args: {
        status: { hasRunning: true, hasFailed: false, hasQueued: false }
    },
    render: (args) => (
        <div className="p-8">
            <p className="text-xs text-stone-500 mb-4">有任务正在运行</p>
            <StatusIndicatorButton {...args} />
        </div>
    ),
};

// 排队中 - 橙色脉冲
export const Queued: Story = {
    args: {
        status: { hasRunning: false, hasFailed: false, hasQueued: true }
    },
    render: (args) => (
        <div className="p-8">
            <p className="text-xs text-stone-500 mb-4">有任务在队列中</p>
            <StatusIndicatorButton {...args} />
        </div>
    ),
};

// 失败 - 红点
export const Failed: Story = {
    args: {
        status: { hasRunning: false, hasFailed: true, hasQueued: false }
    },
    render: (args) => (
        <div className="p-8">
            <p className="text-xs text-stone-500 mb-4">有失败任务</p>
            <StatusIndicatorButton {...args} />
        </div>
    ),
};

// 混合状态 - 失败优先（红点）
export const MixedStatus: Story = {
    args: {
        status: { hasRunning: true, hasFailed: true, hasQueued: true }
    },
    render: (args) => (
        <div className="p-8">
            <p className="text-xs text-stone-500 mb-4">同时有运行中和失败任务（失败优先显示红点）</p>
            <StatusIndicatorButton {...args} />
        </div>
    ),
};

// 所有状态对比
export const AllStates: Story = {
    render: () => (
        <div className="p-8 space-y-6">
            <div className="flex items-center gap-4">
                <span className="text-xs text-stone-500 w-32">默认</span>
                <StatusIndicatorButton status={{ hasRunning: false, hasFailed: false, hasQueued: false }} />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-stone-500 w-32">运行中</span>
                <StatusIndicatorButton status={{ hasRunning: true, hasFailed: false, hasQueued: false }} />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-stone-500 w-32">排队中</span>
                <StatusIndicatorButton status={{ hasRunning: false, hasFailed: false, hasQueued: true }} />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-stone-500 w-32">失败</span>
                <StatusIndicatorButton status={{ hasRunning: false, hasFailed: true, hasQueued: false }} />
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-stone-500 w-32">混合（失败优先）</span>
                <StatusIndicatorButton status={{ hasRunning: true, hasFailed: true, hasQueued: true }} />
            </div>
        </div>
    ),
};
