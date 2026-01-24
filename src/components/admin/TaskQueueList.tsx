import { RotateCw, Trash2, Bot, User, Clock, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { type TaskRow, fetchJson } from './shared';
import { formatTime } from '@server/lib/time';
import { clsx } from 'clsx';
import { useState } from 'react';
import { Popconfirm, Popover } from 'antd';
import TaskProgress from './TaskProgress';

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

    const getLLMIcon = (llm: string | null) => {
        // Simple mapping
        if (llm === 'openai') return <span title="OpenAI" className="text-green-600">GPT</span>;
        if (llm === 'claude') return <span title="Claude" className="text-purple-600">Claude</span>;
        return <span title="Gemini" className="text-blue-600">Gemini</span>;
    };

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
                <button onClick={() => { console.log('[TaskQueueList] Refresh button clicked'); onRefresh(); }} className="text-stone-400 hover:text-stone-900 transition-colors" title="Refresh">
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
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    "font-mono text-xs cursor-pointer",
                                    t.status === 'succeeded' ? "text-stone-400" : "text-stone-600"
                                )} title={t.id}>
                                    {t.id}
                                </span>

                                {/* Mode Badge */}
                                <span className={clsx(
                                    "px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded border",
                                    t.mode === 'impression'
                                        ? "bg-purple-50 text-purple-600 border-purple-200"
                                        : "bg-blue-50 text-blue-600 border-blue-200"
                                )}>
                                    {t.mode === 'impression' ? 'impression' : 'rss'}
                                </span>

                                {/* LLM Badge */}
                                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded border bg-white border-stone-200 flex items-center gap-1">
                                    <Bot size={10} className="text-stone-400" />
                                    {getLLMIcon(t.llm)}
                                </span>

                                {t.profileName && (
                                    <span className="px-1.5 py-0.5 bg-stone-100 text-stone-500 text-[9px] font-bold uppercase tracking-wide rounded border border-stone-200">
                                        {t.profileName}
                                    </span>
                                )}
                            </div>
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
                                <TaskProgress contextJson={t.contextJson} status={t.status} />
                            </div>
                        </div>

                        {/* Article Title (Line 2) */}
                        {t.articleTitle && (
                            <div className="text-xs font-serif font-medium text-stone-800 px-1 truncate leading-tight">
                                {t.articleTitle}
                            </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-400">
                            <div className="flex items-center gap-3">
                                {/* Trigger Source */}
                                <span className="flex items-center gap-1" title={`Trigger: ${t.triggerSource}`}>
                                    {t.triggerSource === 'cron' ? <Clock size={10} /> : <User size={10} />}
                                    {t.triggerSource}
                                </span>

                                <span className="font-mono flex items-center gap-1" title={t.createdAt}>
                                    {formatTime(t.createdAt)}
                                </span>

                            </div>
                            {t.status === 'failed' && <span className="text-red-600 font-bold">Failed</span>}
                            {t.status === 'running' && <span className="text-orange-600 font-bold">Processing</span>}
                        </div>

                        {t.status === 'failed' && t.errorMessage && (
                            <div className="mt-1">
                                <Popover
                                    content={
                                        <div className="max-w-md max-h-64 overflow-auto text-xs font-mono whitespace-pre-wrap">
                                            {t.errorContextJson
                                                ? (typeof t.errorContextJson === 'string'
                                                    ? t.errorContextJson
                                                    : JSON.stringify(t.errorContextJson, null, 2))
                                                : 'No context available'}
                                        </div>
                                    }
                                    title="Error Context"
                                    trigger="click"
                                >
                                    <div className="text-[10px] text-red-600 font-serif italic bg-red-50 p-1.5 leading-tight cursor-pointer hover:bg-red-100 transition-colors flex items-start gap-1">
                                        <AlertCircle size={12} className="mt-0.5 shrink-0" />
                                        <span>{typeof t.errorMessage === 'string' ? t.errorMessage : JSON.stringify(t.errorMessage)}</span>
                                    </div>
                                </Popover>
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}
