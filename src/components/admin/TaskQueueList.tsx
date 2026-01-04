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
    taskDate?: string;
};

export default function TaskQueueList({ tasks, onRefresh, onDelete, taskDate }: TaskQueueListProps) {
    const [deleting, setDeleting] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const failedTasks = tasks.filter(t => t.status === 'failed');

    async function deleteAllFailed() {
        if (failedTasks.length === 0) return;
        setDeleting(true);
        try {
            await fetchJson('/api/admin/tasks/delete-failed', {
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

    async function retryAllFailed() {
        if (failedTasks.length === 0) return;
        setRetrying(true);
        try {
            await fetchJson('/api/admin/tasks/retry-failed', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ task_date: taskDate })
            });
            onRefresh();
        } catch (e) {
            console.error(e);
            alert((e as Error).message || '重试失败');
        } finally {
            setRetrying(false);
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Task Queue</span>
                    {failedTasks.length > 0 && (
                        <>
                            <Popconfirm
                                title="删除失败任务"
                                description={`确定删除所有 ${failedTasks.length} 个失败的任务吗？`}
                                onConfirm={deleteAllFailed}
                                okText="确定"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                            >
                                <button
                                    disabled={deleting || retrying}
                                    className="px-2 py-0.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 hover:border-red-300 uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                    title={`Delete all ${failedTasks.length} failed tasks`}
                                >
                                    {deleting ? 'Deleting...' : `🗑 Clear ${failedTasks.length} Failed`}
                                </button>
                            </Popconfirm>

                            <button
                                onClick={retryAllFailed}
                                disabled={deleting || retrying}
                                className="px-2 py-0.5 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded hover:bg-orange-100 hover:border-orange-300 uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                title={`Retry all ${failedTasks.length} failed tasks`}
                            >
                                {retrying ? <RotateCw className="animate-spin" size={12} /> : `↻ Retry ${failedTasks.length} Failed`}
                            </button>
                        </>
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
                            <div className="flex items-center gap-2">
                                <span className="font-mono">{formatTime(t.created_at)}</span>
                                {t.status === 'running' && (() => {
                                    let stageText = 'Stage 1/4: 搜索选词';
                                    try {
                                        const cp = t.result_json ? JSON.parse(t.result_json) : null;
                                        if (cp?.stage === 'search_selection') stageText = 'Stage 2/4: 撰写草稿';
                                        else if (cp?.stage === 'draft') stageText = 'Stage 3/4: 格式转换';
                                        else if (cp?.stage === 'conversion' || cp?.stage === 'grammar_analysis') stageText = 'Stage 4/4: 语法透视';
                                    } catch { }
                                    return (
                                        <span className="text-orange-500 font-serif italic font-medium lowercase tracking-normal bg-orange-50 px-1.5 py-0.5 rounded-sm">
                                            {stageText}
                                        </span>
                                    );
                                })()}
                            </div>
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
