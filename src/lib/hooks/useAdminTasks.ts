import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api';
import { type TaskRow } from '../../components/admin/shared';
import { updateTaskStatus } from '../store/adminStore';

interface UseAdminTasksProps {
    date: string;
    initialTasks?: TaskRow[]; // SSR 预取的任务数据
    onSucceeded?: () => void;
}

export function useAdminTasks({ date, initialTasks, onSucceeded }: UseAdminTasksProps) {
    const [tasks, setTasks] = useState<TaskRow[]>(initialTasks || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const tasksRef = useRef<TaskRow[]>(initialTasks || []);

    const onSucceededRef = useRef(onSucceeded);
    useEffect(() => {
        onSucceededRef.current = onSucceeded;
    }, [onSucceeded]);

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    const refresh = useCallback(async (showLoading = true) => {
        if (showLoading && tasksRef.current.length === 0) setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<{ tasks?: TaskRow[] }>(`/api/tasks?task_date=${encodeURIComponent(date)}`);
            const newTasks = data?.tasks ?? [];

            // 检测状态转换：从非成功变为成功
            const hasNewSucceeded = newTasks.some(nt =>
                nt.status === 'succeeded' &&
                !tasksRef.current.find(ot => ot.id === nt.id && ot.status === 'succeeded')
            );

            setTasks(newTasks);
            updateTaskStatus(newTasks); // 更新全局任务状态

            if (hasNewSucceeded && onSucceededRef.current) {
                onSucceededRef.current();
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [date]);

    // 初始加载
    useEffect(() => {
        if (date) {
            refresh();
        }
    }, [date, refresh]);

    // 自动轮询
    useEffect(() => {
        const hasActiveTasks = tasks.some(t => t.status === 'running' || t.status === 'queued');
        if (!hasActiveTasks) return;

        const timer = setInterval(() => {
            refresh(false);
        }, 10000);

        return () => clearInterval(timer);
    }, [tasks.length > 0, tasks.some(t => t.status === 'running' || t.status === 'queued'), refresh]);

    const generate = async () => {
        setLoading(true);
        setError(null);
        try {
            await apiFetch('/api/generate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ task_date: date })
            });
            await refresh();
        } catch (e) {
            setError((e as Error).message);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const fetchWords = async () => {
        setLoading(true);
        setError(null);
        try {
            await apiFetch('/api/words/fetch', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ task_date: date }),
            });
        } catch (e) {
            setError((e as Error).message);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    const deleteTask = async (taskId: string) => {
        setLoading(true);
        setError(null);
        try {
            await apiFetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: '{}'
            });
            await refresh();
        } catch (e) {
            setError((e as Error).message);
            throw e;
        } finally {
            setLoading(false);
        }
    };

    return {
        tasks,
        loading,
        error,
        refresh,
        generate,
        fetchWords,
        deleteTask
    };
}

