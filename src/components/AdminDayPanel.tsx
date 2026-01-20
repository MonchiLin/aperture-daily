/**
 * AdminDayPanel - 管理面板内容
 * 
 * 包含 AdminActions（操作按钮）和 TaskQueueList（任务队列）。
 * 权限验证由父组件（AdminDrawer）处理，此组件只关注业务逻辑。
 */
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { message } from 'antd';
import { useStore } from '@nanostores/react';
import AdminActions from './admin/AdminActions';
import TaskQueueList from './admin/TaskQueueList';
import { refreshArticles } from '../lib/store/articlesStore';
import { isAdminStore } from '../lib/store/adminStore';
import { useAdminTasks } from '../lib/hooks/useAdminTasks';

interface Props {
	date: string;
	onRefreshRequest?: () => void;
	isDrawerMode?: boolean;
	initialTasks?: any[]; // SSR 预取的任务数据
}

export default function AdminDayPanel(props: Props) {
	const [collapsed, setCollapsed] = useState(!props.isDrawerMode);

	// 从全局 store 获取权限信息
	const isAdmin = useStore(isAdminStore);

	// 使用任务管理 Hook
	const {
		tasks,
		loading,
		error,
		refresh,
		generate,
		fetchWords,
		deleteTask,
		generateImpression
	} = useAdminTasks({
		date: props.date,
		initialTasks: props.initialTasks,
		onSucceeded: () => {
			refreshArticles(props.date);
			if (props.onRefreshRequest) props.onRefreshRequest();
		}
	});

	// Drawer 模式强制展开
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

	const handleImpression = async () => {
		try {
			await generateImpression();
			await refreshArticles(props.date);
			setCollapsed(false);
			message.success('IMPRESSION任务已创建');
		} catch (e) {
			console.error(e);
		}
	};

	// 非管理员不渲染（双重保险，虽然 AdminDrawer 已经判断过）
	if (!isAdmin) return null;

	const content = (
		<div className="space-y-6">
			<AdminActions
				loading={loading}
				onFetchWords={handleFetchWords}
				onGenerate={handleGenerate}
				onImpression={handleImpression}
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

