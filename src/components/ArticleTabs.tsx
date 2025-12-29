import { Cross2Icon, MagicWandIcon, Pencil2Icon } from '@radix-ui/react-icons';
import { Button, Input } from 'antd'; // 引入 Antd 组件
import { forwardRef, lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArticleReader } from './ArticleReader';

const { TextArea } = Input

const LazyAIChatSidebar = lazy(() => import('./AIChatSidebar').then((m) => ({ default: m.AIChatSidebar })));

const ArticleContent = memo(
	forwardRef<HTMLDivElement, { content: string }>(function ArticleContent(props, ref) {
		return (
			<div ref={ref} className="whitespace-pre-wrap leading-relaxed">
				{props.content}
			</div>
		);
	})
);
ArticleContent.displayName = 'ArticleContent';

type Level = 1 | 2 | 3;

type ArticleLevel = {
	level: Level;
	level_name: string;
	content: string;
	difficulty_desc: string;
};

type ArticleTabsProps = {
	articleId: string;
	articles: ArticleLevel[];
	initialIsAdmin?: boolean;
	title?: string;
	dateLabel?: string;
	reads?: number | null;
	sourceAnchorId?: string | null;
	targetWords?: string[];
};

const ADMIN_KEY_STORAGE = 'luma-words_admin_key';
const WORDS_PER_MINUTE = 120;

type HighlightItem = {
	id: string;
	start_meta: any;
	end_meta: any;
	text: string;
	note: string | null;
	style: any | null;
};

type Rect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

type Placement = 'top' | 'bottom';

type SelectionUiState = {
	rect: Rect;
	text: string;
	placement: Placement;
};

type NoteEditorState =
	| {
		mode: 'create';
		articleId: string;
		level: Level;
		anchor: Rect;
		placement: Placement;
		source: { id: string; start_meta: any; end_meta: any; text: string };
	}
	| {
		mode: 'edit';
		articleId: string;
		id: string;
		anchor: Rect;
		placement: Placement;
		text: string;
		note: string | null;
	};

async function fetchHighlights(articleId: string) {
	const resp = await fetch(`http://localhost:3000/api/articles/${encodeURIComponent(articleId)}/highlights`);
	const text = await resp.text();
	const data = text ? JSON.parse(text) : null;
	if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
	return (data ?? []) as HighlightItem[];
}

// ... (Auth funcs removed as they are unused here, we use verifyKey in SettingsPanel, 
// BUT this file also checks auth. Let's redirect checkAdminSession too or remove it if unused?
// It IS used in useEffect. So we must update checkAdminSession logic SAME as SettingsPanel)

async function checkAdminSession(adminKey: string) {
	try {
		const resp = await fetch('http://localhost:3000/api/auth/check', {
			headers: { 'x-admin-key': adminKey }
		});
		return resp.ok;
	} catch {
		return false;
	}
}

// We rely on adminFetchJson for other calls, update it to point to full URL if not provided?
// Actually better to make explicit full URL calls.

async function adminFetchJson(url: string, adminKey: string | null, init?: RequestInit) {
	const resp = await fetch(url, {
		...init,
		// credentials: 'same-origin', // No longer needed for backend
		headers: {
			...(init?.headers ?? {}),
			...(adminKey ? { 'x-admin-key': adminKey } : {})
		}
	});
	const text = await resp.text();
	// Verify JSON validity
	try {
		const data = text ? JSON.parse(text) : null;
		if (!resp.ok) throw new Error(data?.message || `HTTP ${resp.status}`);
		return data;
	} catch {
		// If not json (maybe 200 OK empty), return null
		if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
		return null;
	}
}

// ...

if (isAdmin) {
	const clickEvent = (Highlighter as any)?.event?.CLICK ?? 'click';
	inst.on(clickEvent, ({ id }: any, _h: any, e: any) => {
		const ev = e as MouseEvent | TouchEvent;
		const asMouse = ev as MouseEvent;
		const currentHighlight = highlightsRef.current.find((h) => h.id === id) ?? null;

		if ('shiftKey' in asMouse && asMouse.shiftKey) {
			if (!window.confirm('删除该批注？')) return;
			(async () => {
				try {
					await adminFetchJson(`http://localhost:3000/api/highlights/${encodeURIComponent(id)}`, adminKey, { method: 'DELETE' });
					highlighterRef.current?.remove?.(id);
					appliedIdsRef.current.delete(id);
					setHighlights((prev) => prev.filter((h) => h.id !== id));
				} catch (err) {
					console.error((err as Error).message);
				}
			})();
			return;
		}

		const anchor = getEventPointRect(ev) ?? { left: 16, top: 16, right: 16, bottom: 16, width: 0, height: 0 };
		const placement = pickPlacement(anchor);
		closeSelectionUi();
		setNoteDraft(currentHighlight?.note ?? '');
		setNoteEditor({
			mode: 'edit',
			articleId: props.articleId,
			id,
			anchor,
			placement,
			text: currentHighlight?.text ?? '',
			note: currentHighlight?.note ?? null
		});
	});
}
			} catch (err) {
	if (!canceled) console.error((err as Error).message);
}
		}) ();

return () => {
	canceled = true;
	if (inst) {
		inst.dispose?.();
		if (highlighterRef.current === inst) highlighterRef.current = null;
	}
	appliedIdsRef.current = new Set();
	selectionRangeRef.current = null;
};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.articleId, level, isAdmin, adminKey]);

useEffect(() => {
	let canceled = false;
	(async () => {
		if (!adminKey) {
			if (!canceled) setIsAdmin(false);
			return;
		}
		const ok = await checkAdminSession(adminKey);
		if (!canceled) setIsAdmin(ok);
	})();
	return () => {
		canceled = true;
	};
}, [adminKey]);

useEffect(() => {
	const root = contentRef.current;
	if (!root) return;
	if (!isAdmin) {
		closeFloatingUi();
		return;
	}

	let raf = 0;
	const scheduleUpdate = () => {
		if (raf) cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			if (noteEditor) return;
			const info = getSelectionInRoot(root);
			if (!info) {
				closeSelectionUi();
				return;
			}
			selectionRangeRef.current = info.range.cloneRange();
			setSelectionUi({
				rect: info.rect,
				text: info.text,
				placement: pickPlacement(info.rect)
			});
		});
	};

	const onPointerUp = () => scheduleUpdate();
	const onKeyUp = () => scheduleUpdate();

	root.addEventListener('pointerup', onPointerUp);
	document.addEventListener('keyup', onKeyUp);

	return () => {
		if (raf) cancelAnimationFrame(raf);
		root.removeEventListener('pointerup', onPointerUp);
		document.removeEventListener('keyup', onKeyUp);
	};
}, [isAdmin, noteEditor]);

useEffect(() => {
	if (!isAdmin) return;
	if (!selectionUi && !noteEditor) return;

	const onPointerDown = (e: PointerEvent) => {
		const target = e.target as Node | null;
		const overlay = overlayRef.current;
		if (target && overlay && overlay.contains(target)) return;

		if (noteEditor?.mode === 'create') closeNoteEditor({ cancelCreateHighlight: true });
		else closeNoteEditor({ cancelCreateHighlight: false });
		closeSelectionUi();
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key !== 'Escape') return;
		if (noteEditor?.mode === 'create') closeNoteEditor({ cancelCreateHighlight: true });
		else closeNoteEditor({ cancelCreateHighlight: false });
		closeSelectionUi();
	};

	const onScrollOrResize = () => {
		// 布局变化时关闭浮层，避免位置失效。
		if (noteEditor?.mode === 'create') closeNoteEditor({ cancelCreateHighlight: true });
		else closeNoteEditor({ cancelCreateHighlight: false });
		closeSelectionUi();
	};

	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('keydown', onKeyDown);
	window.addEventListener('resize', onScrollOrResize);
	window.addEventListener('scroll', onScrollOrResize, true);

	return () => {
		document.removeEventListener('pointerdown', onPointerDown, true);
		document.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('resize', onScrollOrResize);
		window.removeEventListener('scroll', onScrollOrResize, true);
	};
}, [isAdmin, selectionUi, noteEditor]);

useEffect(() => {
	const inst = highlighterRef.current;
	if (!inst) return;

	for (const h of highlights) {
		const hlLevel = getHighlightLevel(h.style);
		if (hlLevel !== null && hlLevel !== level) continue;
		if (appliedIdsRef.current.has(h.id)) continue;
		inst.fromStore(h.start_meta, h.end_meta, h.text, h.id);
		appliedIdsRef.current.add(h.id);
	}
}, [highlights, level, hlInstanceToken]);

async function startCreateNote() {
	if (!isAdmin) return;
	const inst = highlighterRef.current;
	const range = selectionRangeRef.current;
	if (!inst || !range || !selectionUi) return;

	setNoteSaving(false);

	const source = inst.fromRange(range as Range) as any;
	if (!source?.id) return;

	appliedIdsRef.current.add(source.id);
	window.getSelection()?.removeAllRanges();
	closeSelectionUi();
	setNoteDraft('');
	setNoteEditor({
		mode: 'create',
		articleId: props.articleId,
		level,
		anchor: selectionUi.rect,
		placement: selectionUi.placement,
		source: {
			id: source.id,
			start_meta: source.startMeta,
			end_meta: source.endMeta,
			text: source.text
		}
	});
}

function dispatchAnalyzeSelection() {
	if (!isAdmin) return;
	if (!selectionUi) return;
	const selectionText = selectionUi.text.trim();
	if (!selectionText) return;

	window.getSelection()?.removeAllRanges();
	closeSelectionUi();
	setAnalyzeSelection({ selectionText, article: current?.content ?? '' });
	setChatOpen(true);
}

async function saveNote() {
	if (!isAdmin || !noteEditor) return;
	if (noteSaving) return;

	const nextNote = noteDraft.trim() ? noteDraft.trim() : null;
	setNoteSaving(true);

	try {
		if (noteEditor.mode === 'create') {
			await adminFetchJson(`http://localhost:3000/api/highlights`, adminKey, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: noteEditor.source.id,
					articleId: noteEditor.articleId,
					startMeta: noteEditor.source.start_meta,
					endMeta: noteEditor.source.end_meta,
					text: noteEditor.source.text,
					note: nextNote,
					style: { level: noteEditor.level }
				})
			});
			await refreshHighlights();
			closeNoteEditor({ cancelCreateHighlight: false });
		} else {
			// PATCH to PUT? Elysia uses PUT for update usually in my impl? 
			// Wait, my backend impl: .post("/api/highlights"...) and .delete. 
			// I missed UPDATE highlight in backend!
			// Let me check index.ts briefly... I only added GET, POST, DELETE.
			// I need to add PUT /api/highlights/:id to backend OR stick to delete+create?
			// Actually I should add PUT. 
			// But for now, since I can't edit index.ts in the same tool call, and the user wants migration...
			// I will use POST (create) which I have, but for EDIT I need PATCH/PUT?
			// Ah, looking at my backend code from previous step:
			// I added: GET, POST, DELETE. I did NOT add PUT for highlights.
			// This logic here (mode === 'edit') uses PATCH.
			// I must add PUT/PATCH endpoint to backend first?
			// Or I can delete and re-create? No that changes ID.

			// CRITICAL: Next step I must add PUT endpoint to backend.
			// For now, I will write the client code assuming the endpoint is `PUT /api/highlights/:id`.
			await adminFetchJson(`http://localhost:3000/api/highlights/${encodeURIComponent(noteEditor.id)}`, adminKey, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ note: nextNote })
			});
			setHighlights((prev) => prev.map((h) => (h.id === noteEditor.id ? { ...h, note: nextNote } : h)));
			closeNoteEditor({ cancelCreateHighlight: false });
		}
	} catch (err) {
		console.error((err as Error).message);
	} finally {
		setNoteSaving(false);
	}
}

const wordStats = useMemo(() => {
	const text = current?.content ?? '';
	const words = text.trim().split(/\s+/).filter(Boolean);
	const count = words.length;
	const minutes = count ? Math.max(1, Math.ceil(count / WORDS_PER_MINUTE)) : 0;
	return { count, minutes };
}, [current?.content]);


// const wordLabel = wordStats.count === 1 ? 'word' : 'words';
const minuteLabel = wordStats.minutes === 1 ? 'minute' : 'minutes';

const contentParagraphs = useMemo(() => {
	// Clean text: remove newlines/extra spaces within paragraphs to ensure smooth TTS flow
	// and consistent charIndex alignment.
	return current?.content?.split('\n')
		.filter((p: string) => p.trim().length > 0)
		.map((p) => p.replace(/\s+/g, ' ').trim()) || [];
}, [current?.content]);

// Sync playlist to audio store
useEffect(() => {
	if (contentParagraphs.length > 0) {
		setPlaylist(contentParagraphs);
	}
}, [contentParagraphs]);

return (
	<div className="relative">
		<div className="bg-white rounded-3xl border border-gray-100 p-6 md:p-8">
			<ArticleReader
				id={props.articleId}
				title={props.title || ''}
				publishDate={props.dateLabel || ''}
				stats={{
					wordCount: wordStats.count,
					readingTime: `${wordStats.minutes} ${minuteLabel}`,
					readCount: props.reads || 0
				}}
				level={level}
				content={contentParagraphs}
				targetWords={props.targetWords ?? []}
				onLevelChange={(newLevel) => {
					closeFloatingUi();
					setLevel(newLevel);
				}}
				contentRef={contentRef}
			/>
		</div>

		{/* 管理员 / 高亮 UI 覆盖层 */}
		{/* 其余 portal 逻辑保持不变 */}


		{
			portalReady && isAdmin
				? createPortal(
					<div ref={overlayRef} className="pointer-events-none fixed inset-0 z-50">
						{selectionUi && !noteEditor ? (
							<div
								className="pointer-events-auto"
								style={{
									position: 'fixed',
									left: selectionUi.rect.left + selectionUi.rect.width / 2,
									top: selectionUi.placement === 'top' ? selectionUi.rect.top : selectionUi.rect.bottom,
									transform: selectionUi.placement === 'top' ? 'translate(-50%, calc(-100% - 8px))' : 'translate(-50%, 8px)'
								}}
							>
								<div className="flex items-center gap-1 rounded-full border border-black/10 bg-white/80 p-1 shadow-lg backdrop-blur">
									<button
										type="button"
										className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5"
										title="标注"
										onClick={startCreateNote}
									>
										<Pencil2Icon />
									</button>
									<button
										type="button"
										className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5"
										title="解析"
										onClick={dispatchAnalyzeSelection}
									>
										<MagicWandIcon />
									</button>
								</div>
							</div>
						) : null}

						{noteEditor ? (
							<div
								className="pointer-events-auto"
								style={{
									position: 'fixed',
									left: noteEditor.anchor.left + (noteEditor.anchor.width ? noteEditor.anchor.width / 2 : 0),
									top: noteEditor.placement === 'top' ? noteEditor.anchor.top : noteEditor.anchor.bottom,
									transform: noteEditor.placement === 'top' ? 'translate(-50%, calc(-100% - 10px))' : 'translate(-50%, 10px)',
									width: 'min(420px, calc(100vw - 24px))'
								}}
							>
								<div className="rounded-xl border border-black/10 bg-white/90 p-2 shadow-lg backdrop-blur">
									<div className="grid grid-cols-[1fr_auto] items-start gap-2">
										<TextArea
											placeholder="备注…"
											value={noteDraft}
											onChange={(e) => setNoteDraft(e.target.value)}
											rows={3}
										/>
										<button
											type="button"
											className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-black/5 hover:text-gray-900"
											title="关闭"
											onClick={() => (noteEditor.mode === 'create' ? closeNoteEditor({ cancelCreateHighlight: true }) : closeNoteEditor({ cancelCreateHighlight: false }))}
										>
											<Cross2Icon />
										</button>
									</div>

									<div className="flex justify-between gap-2 mt-2">
										{noteEditor.mode === 'edit' && <Button onClick={async () => {
											try {
												await adminFetchJson(`http://localhost:3000/api/highlights/${encodeURIComponent(noteEditor.id)}`, adminKey, { method: 'DELETE' });
												highlighterRef.current?.remove?.(noteEditor.id);
												appliedIdsRef.current.delete(noteEditor.id);
												setHighlights((prev) => prev.filter((h) => h.id !== noteEditor.id));
												closeNoteEditor({ cancelCreateHighlight: false });
											} catch (err) {
												console.error((err as Error).message);
											}
										}} size="small" danger>
											Delete
										</Button>
										}
										<div className="flex justify-end gap-2 ml-auto">
											<Button size="small" onClick={() => closeNoteEditor({ cancelCreateHighlight: noteEditor.mode === 'create' })} disabled={noteSaving}>
												Cancel
											</Button>
											<Button size="small" type="primary" onClick={saveNote} loading={noteSaving} style={{ backgroundColor: '#ea580c' }}>
												Save
											</Button>
										</div>
									</div>
								</div>
							</div>
						) : null}
					</div>,
					document.body
				)
				: null
		}

		{
			isAdmin && chatOpen ? (
				<Suspense fallback={null}>
					<LazyAIChatSidebar isOpen onClose={() => setChatOpen(false)} analyzeSelection={analyzeSelection} />
				</Suspense>
			) : null
		}
	</div >
);
}
