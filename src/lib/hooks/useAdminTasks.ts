import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../api';
import { type TaskRow } from '../../components/admin/shared';

interface UseAdminTasksProps {
    date: string;
    adminKey: string | null;
    onSucceeded?: () => void;
}

export function useAdminTasks({ date, adminKey, onSucceeded }: UseAdminTasksProps) {
    const [tasks, setTasks] = useState<TaskRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const tasksRef = useRef<TaskRow[]>([]);

    const onSucceededRef = useRef(onSucceeded);
    useEffect(() => {
        onSucceededRef.current = onSucceeded;
    }, [onSucceeded]);

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    const refresh = useCallback(async (showLoading = true) => {
        if (!adminKey) return;
        if (showLoading && tasksRef.current.length === 0) setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<{ tasks?: TaskRow[] }>(`/api/tasks?task_date=${encodeURIComponent(date)}`, { token: adminKey });
            const newTasks = data?.tasks ?? [];

            // 检测状态转换：从非成功变为成功
            const hasNewSucceeded = newTasks.some(nt =>
                nt.status === 'succeeded' &&
                !tasksRef.current.find(ot => ot.id === nt.id && ot.status === 'succeeded')
            );

            setTasks(newTasks);

            if (hasNewSucceeded && onSucceededRef.current) {
                onSucceededRef.current();
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [date, adminKey]); // Removed onSucceeded

    // 初始加载
    useEffect(() => {
        if (adminKey) {
            refresh();
        }
    }, [adminKey, date, refresh]);

    // 自动轮询
    useEffect(() => {
        if (!adminKey) return;

        const hasActiveTasks = tasks.some(t => t.status === 'running' || t.status === 'queued');
        if (!hasActiveTasks) return;

        const timer = setInterval(() => {
            refresh(false);
        }, 10000);

        return () => clearInterval(timer);
    }, [adminKey, tasks.length > 0, tasks.some(t => t.status === 'running' || t.status === 'queued'), refresh]);

    const generate = async () => {
        if (!adminKey) return;
        setLoading(true);
        setError(null);
        try {
            await apiFetch('/api/generate', {
                method: 'POST',
                token: adminKey,
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
        if (!adminKey) return;
        setLoading(true);
        setError(null);
        try {
            await apiFetch('/api/words/fetch', {
                method: 'POST',
                token: adminKey,
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
        if (!adminKey) return;
        setLoading(true);
        setError(null);
        try {
            await apiFetch(`/api/tasks/${taskId}`, {
                method: 'DELETE',
                token: adminKey,
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
