import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronRight, RotateCw, Trash2, Play, FileDown } from 'lucide-react';

const ADMIN_KEY_STORAGE = 'luma-words_admin_key';

type TaskRow = {
	id: string;
	taskDate: string;
	type: string;
	triggerSource: string;
	status: string;
	profileId: string;
	profileName: string | null;
	profileTopicPreference: string | null;
	resultJson: string | null;
	errorMessage: string | null;
	errorContextJson: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	publishedAt: string | null;
};

function splitTopicTags(input: string) {
	const parts = input
		.split(/[,，\n;；|]+/g)
		.map((x) => x.trim())
		.filter(Boolean);
	return Array.from(new Set(parts));
}

function formatTime(isoString: string | null) {
	if (!isoString) return '-';
	try {
		return new Date(isoString).toLocaleTimeString('en-GB', { hour12: false }); // 时间格式 HH:mm:ss
	} catch {
		return '-';
	}
}

async function fetchJson(url: string, adminKey: string, init?: RequestInit) {
	const resp = await fetch(url, {
		...init,
		headers: {
			...(init?.headers ?? {}),
			'x-admin-key': adminKey
		}
	});
	const text = await resp.text();
	const data = text ? JSON.parse(text) : null;
	if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
	return data;
}

export default function AdminDayPanel(props: { date: string }) {
	const [adminKey, setAdminKey] = useState<string | null>(null);
	const [isAdmin, setIsAdmin] = useState(false);
	const [tasks, setTasks] = useState<TaskRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState(true);

	const canUse = useMemo(() => isAdmin && !!adminKey, [isAdmin, adminKey]);

	// 校验管理员权限
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
				await fetchJson('/api/admin/check', adminKey);
				if (!canceled) setIsAdmin(true);
			} catch {
				if (!canceled) setIsAdmin(false);
			}
		})();
		return () => {
			canceled = true;
		};
	}, [adminKey]);

	// 加载任务
	async function refresh() {
		if (!adminKey) return;
		// 已有数据时，后台轮询不显示 loading
		if (tasks.length === 0) setLoading(true);
		setError(null);
		try {
			const data = await fetchJson(`/api/admin/tasks?task_date=${encodeURIComponent(props.date)}`, adminKey);
			setTasks((data?.tasks ?? []) as TaskRow[]);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	// 初次加载
	useEffect(() => {
		if (!canUse) return;
		void refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [canUse, props.date]);

	// 自动轮询刷新
	useEffect(() => {
		if (!canUse) return;
		const hasActiveTasks = tasks.some(t => t.status === 'running' || t.status === 'queued');
		if (!hasActiveTasks) return;

		const timer = setInterval(() => {
			// 后台刷新，尽量减少闪烁
			fetchJson(`/api/admin/tasks?task_date=${encodeURIComponent(props.date)}`, adminKey!)
				.then(data => setTasks((data?.tasks ?? []) as TaskRow[]))
				.catch(console.error); // 轮询错误静默处理
		}, 3000);

		return () => clearInterval(timer);
	}, [canUse, tasks, adminKey, props.date]);


	async function generate() {
		if (!adminKey) return;
		setLoading(true);
		setError(null);
		try {
			await fetchJson('/api/admin/tasks/generate', adminKey, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ task_date: props.date })
			});
			await refresh();
			setCollapsed(false); // 生成后自动展开
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	async function fetchWords() {
		if (!adminKey) return;
		setLoading(true);
		setError(null);
		try {
			await fetchJson('/api/admin/words/fetch', adminKey, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ task_date: props.date })
			});
			// 是否需要 toast/反馈？
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	async function deleteTask(taskId: string) {
		if (!adminKey) return;
		if (!confirm('确定删除这个任务吗？这会同时删除关联的文章和批注。')) return;
		setLoading(true);
		setError(null);
		try {
			await fetchJson(`/api/admin/tasks/${taskId}/delete`, adminKey, { method: 'POST' });
			await refresh();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	if (!canUse) return null;

	return (
		<div className="mb-6 rounded-xl overflow-hidden transition-all duration-300">
			{/* 头部 / 折叠 */}
			<div
				className="group flex items-center justify-between py-2 cursor-pointer select-none opacity-60 hover:opacity-100 transition-opacity"
				onClick={() => setCollapsed(!collapsed)}
			>
				<div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-widest">
					<span>Admin Controls</span>
					{loading && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
				</div>
				<div className="flex items-center gap-1">
					<div className={`transform transition-transform duration-300 text-stone-400 ${!collapsed ? 'rotate-180' : ''}`}>
						<ChevronDown size={14} />
					</div>
				</div>
			</div>

			{/* 折叠内容 - 更加隐形的设计 */}
			{!collapsed && (
				<div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">

					{/* 操作栏 */}
					<div className="flex gap-2">
						<button
							onClick={fetchWords}
							disabled={loading}
							className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-stone-600 bg-white/50 hover:bg-white border border-stone-200/50 hover:border-stone-300 rounded-lg transition-all disabled:opacity-50 shadow-sm"
						>
							<FileDown size={12} />
							Fetch Words
						</button>
						<button
							onClick={generate}
							disabled={loading}
							className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-stone-700 bg-white/50 hover:bg-white border border-stone-200/50 hover:border-stone-300 rounded-lg transition-all disabled:opacity-50 shadow-sm"
						>
							<Play size={12} className="text-orange-500 fill-orange-500" />
							Generate
						</button>
					</div>

					{error && (
						<div className="text-[10px] sm:text-xs text-red-600 bg-red-50/80 p-3 rounded-lg border border-red-100/50 backdrop-blur-sm">
							{error}
						</div>
					)}

					{/* 任务列表 */}
					<div className="space-y-2">
						<div className="flex items-center justify-between text-[10px] font-semibold text-stone-400 uppercase px-1">
							<span>Task Queue</span>
							<button onClick={refresh} className="hover:text-stone-700 transition-colors" title="Refresh"><RotateCw size={10} /></button>
						</div>

						{tasks.length === 0 ? (
							<div className="text-xs text-stone-400/70 text-center py-4 bg-stone-100/30 rounded-lg border border-dashed border-stone-200/50">
								No tasks
							</div>
						) : (
							tasks.map(t => (
								<div key={t.id} className="relative bg-white/60 hover:bg-white border border-stone-100 hover:border-stone-200/60 rounded-lg p-3 text-xs shadow-sm transition-all group">
									<div className="flex justify-between items-center mb-1.5">
										<div className="font-semibold text-stone-700 truncate pr-2">
											{t.profileName || 'Default'}
										</div>
										<span className={clsx(
											"flex-shrink-0 w-1.5 h-1.5 rounded-full",
											{
												'bg-yellow-400': t.status === 'queued',
												'bg-blue-500 animate-pulse': t.status === 'running',
												'bg-green-500': t.status === 'succeeded',
												'bg-red-500': t.status === 'failed',
											}
										)} title={t.status} />
									</div>

									<div className="flex items-center justify-between text-stone-500 text-[10px]">
										<span className="font-mono opacity-70">{formatTime(t.createdAt)}</span>
										<div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												onClick={() => deleteTask(t.id)}
												className="text-stone-400 hover:text-red-500 transition-colors"
												title="Delete"
											>
												<Trash2 size={12} />
											</button>
										</div>
									</div>
									{t.errorMessage && <div className="mt-1 text-red-500 truncate" title={t.errorMessage}>{t.errorMessage}</div>}
								</div>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}
