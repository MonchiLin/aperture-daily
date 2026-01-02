/**
 * AdminDrawer - 管理抽屉
 * 
 * 独立的管理入口，点击打开右侧抽屉显示管理功能。
 */
import { useState } from 'react';
import { Drawer, ConfigProvider } from 'antd';
import { Settings } from 'lucide-react';
import AdminDayPanel from './AdminDayPanel';

import { isAdminStore } from '../lib/store/adminStore';
import { useStore } from '@nanostores/react';

export default function AdminDrawer({ date }: { date: string }) {
    const [open, setOpen] = useState(false);
    const isAdmin = useStore(isAdminStore);

    if (!isAdmin) return null;

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
                    <AdminDayPanel date={date} isDrawerMode={true} />
                </Drawer>
            </>
        </ConfigProvider>
    );
}
