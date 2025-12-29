import { RotateCw, Trash2 } from 'lucide-react';
import { type TaskRow, formatTime, fetchJson } from './shared';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Popconfirm } from 'antd';

type TaskQueueListProps = {
    tasks: TaskRow[];
    loading?: boolean;
    onRefresh: () => void;
    onDelete: (id: string) => void;
    adminKey?: string | null;
    taskDate?: string;
};

export default function TaskQueueList({ tasks, onRefresh, onDelete, adminKey, taskDate }: TaskQueueListProps) {
    const [deleting, setDeleting] = useState(false);
    const failedTasks = tasks.filter(t => t.status === 'failed');

    async function deleteAllFailed() {
        if (!adminKey || failedTasks.length === 0) return;
        setDeleting(true);
        try {
            await fetchJson('/api/admin/tasks/delete-failed', adminKey, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ task_date: taskDate })
            });
            onRefresh();
        } catch (e) {
            console.error(e);
            alert((e as Error).message || '删除失败');
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Task Queue</span>
                    {failedTasks.length > 0 && (
                        <Popconfirm
                            title="删除失败任务"
                            description={`确定删除所有 ${failedTasks.length} 个失败的任务吗？`}
                            onConfirm={deleteAllFailed}
                            okText="确定"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                        >
                            <button
                                disabled={deleting}
                                className="px-2 py-0.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 hover:border-red-300 uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                title={`Delete all ${failedTasks.length} failed tasks`}
                            >
                                {deleting ? 'Deleting...' : `🗑 Clear ${failedTasks.length} Failed`}
                            </button>
                        </Popconfirm>
                    )}
                </div>
                <button onClick={onRefresh} className="text-stone-400 hover:text-stone-900 transition-colors" title="Refresh">
                    <RotateCw size={12} />
                </button>
            </div>

            {tasks.length === 0 ? (
                <div className="text-xs text-stone-400 italic font-serif py-2">
                    No active tasks
                </div>
            ) : (
                tasks.map(t => (
                    <div key={t.id} className="group flex flex-col gap-1 py-2 border-b border-dotted border-stone-200 last:border-0 hover:bg-stone-50 -mx-2 px-2 transition-colors">
                        <div className="flex justify-between items-center">
                            <span className="font-mono text-stone-600 text-xs">
                                {t.id}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    "w-1.5 h-1.5 rounded-full",
                                    {
                                        'bg-stone-300': t.status === 'queued',
                                        'bg-orange-500 animate-pulse': t.status === 'running',
                                        'bg-green-600': t.status === 'succeeded',
                                        'bg-red-600': t.status === 'failed',
                                    }
                                )} title={t.status} />
                                <Popconfirm
                                    title="删除任务"
                                    description="确定删除这个任务吗？这会同时删除关联的文章和批注。"
                                    onConfirm={() => onDelete(t.id)}
                                    okText="确定"
                                    cancelText="取消"
                                    okButtonProps={{ danger: true }}
                                >
                                    <button
                                        className="opacity-0 group-hover:opacity-100 text-stone-300 hover:text-red-600 transition-all"
                                        title="Delete Task"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </Popconfirm>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-500">
                            <span className="font-mono">{formatTime(t.created_at)}</span>
                            {t.status === 'failed' && <span className="text-red-600 font-bold">Failed</span>}
                            {t.status === 'running' && <span className="text-orange-600 font-bold">Processing</span>}
                        </div>

                        {t.status === 'failed' && t.error_message && (
                            <div className="text-[10px] text-red-600 font-serif italic mt-1 bg-red-50 p-1.5 leading-tight">
                                {t.error_message}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}
