/**
 * AdminDrawer - 管理抽屉
 * 
 * 独立的管理入口，点击打开右侧抽屉显示管理功能。
 * MANAGE 按钮显示任务状态指示器（失败=红点，运行中/排队中=橙色脉冲）
 * 
 * ⚠️ 权限由 SSR 层控制，此组件仅在管理员身份确认后渲染
 */
import { useState, useEffect } from 'react';
import { Drawer, ConfigProvider } from 'antd';
import { Settings } from 'lucide-react';
import AdminDayPanel from './AdminDayPanel';

import { taskStatusStore } from '../lib/store/adminStore';
import { useStore } from '@nanostores/react';

interface Props {
    date: string;
    initialTasks?: any[]; // SSR 预取的任务数据
}

export default function AdminDrawer({ date, initialTasks }: Props) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const taskStatus = useStore(taskStatusStore);

    useEffect(() => {
        setMounted(true);
    }, []);

    // 状态指示器：失败 > 运行中/排队中
    // 状态指示器：失败 > 运行中/排队中
    const statusIndicator = !mounted ? null : taskStatus.hasFailed ? (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="有失败任务" />
    ) : (taskStatus.hasRunning || taskStatus.hasQueued) ? (
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" title="有进行中任务" />
    ) : null;

    return (
        <ConfigProvider
            theme={{
                token: {
                    fontFamily: 'inherit',
                }
            }}
        >
            <>
                <button
                    onClick={() => setOpen(true)}
                    className="flex items-center gap-1 text-[10px] font-bold tracking-[0.15em] uppercase text-amber-600 hover:text-amber-700 transition-colors cursor-pointer"
                >
                    <Settings size={12} />
                    MANAGE
                    {statusIndicator}
                </button>
                <Drawer
                    title={
                        <span className="font-serif italic text-stone-600">
                            管理 · {date}
                        </span>
                    }
                    placement="right"
                    onClose={() => setOpen(false)}
                    open={open}
                    size="large"
                    styles={{
                        header: { borderBottom: '1px solid #e7e5e4' },
                        body: { padding: '24px' }
                    }}
                >
                    <AdminDayPanel date={date} isDrawerMode={true} initialTasks={initialTasks} />
                </Drawer>
            </>
        </ConfigProvider>
    );
}

