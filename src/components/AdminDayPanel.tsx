import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { message } from 'antd';
import AdminActions from './admin/AdminActions';
import TaskQueueList from './admin/TaskQueueList';
import { apiFetch } from '../lib/api';
import { refreshArticles } from '../lib/store/articlesStore';
import { useAdminTasks } from '../lib/hooks/useAdminTasks';

const ADMIN_KEY_STORAGE = 'aperture-daily_admin_key';

export default function AdminDayPanel(props: { date: string; onRefreshRequest?: () => void; isDrawerMode?: boolean }) {
	const [adminKey, setAdminKey] = useState<string | null>(null);
	const [isAdmin, setIsAdmin] = useState(false);
	const [collapsed, setCollapsed] = useState(!props.isDrawerMode);

	// 权限校验
	useEffect(() => {
		try {
			const key = localStorage.getItem(ADMIN_KEY_STORAGE);
			setAdminKey(key && key.trim() ? key.trim() : null);
		} catch {
			setAdminKey(null);
		}
	}, []);

	useEffect(() => {
		if (!adminKey) return;
		let canceled = false;
		(async () => {
			try {
				await apiFetch('/api/auth/check', { token: adminKey });
				if (!canceled) setIsAdmin(true);
			} catch {
				if (!canceled) setIsAdmin(false);
			}
		})();
		return () => {
			canceled = true;
		};
	}, [adminKey]);

	// 使用拆分后的 Hook
	const {
		tasks,
		loading,
		error,
		refresh,
		generate,
		fetchWords,
		deleteTask
	} = useAdminTasks({
		date: props.date,
		adminKey: isAdmin ? adminKey : null,
		onSucceeded: () => {
			// 任务成功后的响应式刷新
			refreshArticles(props.date);
			if (props.onRefreshRequest) props.onRefreshRequest();
		}
	});

	// 强制展开如果是在 Drawer 模式
	useEffect(() => {
		if (props.isDrawerMode) setCollapsed(false);
	}, [props.isDrawerMode]);

	const handleGenerate = async (count: number = 1) => {
		try {
			for (let i = 0; i < count; i++) {
				await generate();
			}
			await refreshArticles(props.date);
			setCollapsed(false);
		} catch (e) {
			console.error(e);
		}
	};

	const handleFetchWords = async () => {
		try {
			await fetchWords();
			if (props.onRefreshRequest) props.onRefreshRequest();
			message.success('单词已拉取，请稍后查看');
		} catch (e) {
			console.error(e);
		}
	};

	const handleDeleteTask = async (taskId: string) => {
		try {
			await deleteTask(taskId);
			await refreshArticles(props.date);
		} catch (e) {
			console.error(e);
		}
	};

	if (!isAdmin) return null;

	const content = (
		<div className="space-y-6">
			<AdminActions
				loading={loading}
				onFetchWords={handleFetchWords}
				onGenerate={handleGenerate}
			/>

			{error && (
				<div className="text-xs font-serif text-red-700 bg-red-50 p-3 italic border-l-2 border-red-700">
					Error: {error}
				</div>
			)}

			<TaskQueueList
				tasks={tasks}
				onRefresh={() => refresh()}
				onDelete={handleDeleteTask}
				adminKey={adminKey!}
				taskDate={props.date}
			/>
		</div>
	);

	if (props.isDrawerMode) {
		return content;
	}

	return (
		<div className="mb-8 border-b border-stone-200 pb-4">
			{/* Header */}
			<button
				className="w-full group flex items-center justify-between py-2 cursor-pointer select-none hover:bg-stone-50 transition-colors -mx-2 px-2 rounded-sm"
				onClick={() => setCollapsed(!collapsed)}
			>
				<div className="flex items-center gap-2 text-xs font-bold text-stone-900 uppercase tracking-widest">
					<span>Admin Controls</span>
					{loading && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
				</div>
				<div className={`transform transition-transform duration-300 text-stone-400 ${!collapsed ? 'rotate-180' : ''}`}>
					<ChevronDown size={14} />
				</div>
			</button>

			{/* Content Body */}
			<div
				className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.19,1,0.22,1)] ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
			>
				<div className="overflow-hidden">
					<div className="pt-4">
						{content}
					</div>
				</div>
			</div>
		</div>
	);
}
