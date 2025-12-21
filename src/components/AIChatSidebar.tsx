import { Bubble, Sender } from '@ant-design/x';
import { Button, Drawer } from 'antd';
import XMarkdown from '@ant-design/x-markdown';
import { Bot, Eraser, Square, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createOpenAiCompatibleClient } from '@/lib/llm/client';

interface AIChatSidebarProps {
	isOpen?: boolean;
	onClose?: () => void;
	className?: string;
	initialMessages?: any[];
	analyzeSelection?: {
		selectionText: string;
		article: string;
	} | null;
}

type ChatRole = 'user' | 'assistant' | 'system';

type ChatMessage = {
	id: string;
	role: ChatRole;
	content: string;
	createAt: number;
	updateAt: number;
};

const defaultModel = import.meta.env.PUBLIC_LLM_MODEL_DEFAULT;

function createId(prefix: string) {
	const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(16).slice(2);
	return `${prefix}-${Date.now()}-${rand}`;
}

function getSafeClient() {
	try {
		return createOpenAiCompatibleClient(
			{
				LLM_API_KEY: import.meta.env.PUBLIC_LLM_API_KEY,
				LLM_BASE_URL: import.meta.env.PUBLIC_LLM_BASE_URL
			},
			{ dangerouslyAllowBrowser: true }
		);
	} catch (e) {
		return null;
	}
}

function normalizeInitialMessages(initialMessages: any[]): ChatMessage[] {
	if (!Array.isArray(initialMessages) || initialMessages.length === 0) return [];
	const now = Date.now();
	return initialMessages
		.map((m, index) => {
			const role = (m?.role ?? 'assistant') as ChatRole;
			const content = typeof m?.content === 'string' ? m.content : '';
			const id = typeof m?.id === 'string' && m.id ? m.id : `init-${index}-${now}`;
			const t = typeof m?.createdAt === 'number' ? m.createdAt : now + index;
			return {
				id,
				role,
				content,
				createAt: t,
				updateAt: t
			} satisfies ChatMessage;
		})
		.filter((m) => m.content.trim().length > 0);
}

export function AIChatSidebar({
	isOpen = true,
	onClose,
	className,
	initialMessages = [],
	analyzeSelection = null
}: AIChatSidebarProps) {
	const lastAnalyzeKeyRef = useRef<string | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>(() => normalizeInitialMessages(initialMessages));
	const messagesRef = useRef<ChatMessage[]>(messages);
	const abortRef = useRef<AbortController | null>(null);

	const [input, setInput] = useState('');
	const [streamingId, setStreamingId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const isStreamingRef = useRef(false);

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	useEffect(() => {
		isStreamingRef.current = isStreaming;
	}, [isStreaming]);

	const stop = useCallback(() => {
		abortRef.current?.abort();
		abortRef.current = null;
		isStreamingRef.current = false;
		setIsStreaming(false);
		setStreamingId(null);
	}, []);

	const clear = useCallback(() => {
		stop();
		setMessages([]);
	}, [stop]);

	const sendText = useCallback(async (text: string) => {
		const trimmed = text.trim();
		if (!trimmed) return;

		if (isStreamingRef.current) stop();

		const now = Date.now();
		const userMsg: ChatMessage = {
			id: createId('user'),
			role: 'user',
			content: trimmed,
			createAt: now,
			updateAt: now
		};

		const assistantId = createId('assistant');
		const assistantMsg: ChatMessage = {
			id: assistantId,
			role: 'assistant',
			content: '',
			createAt: now,
			updateAt: now
		};

		const history = [...messagesRef.current, userMsg];
		setMessages([...history, assistantMsg]);

		const client = getSafeClient();
		if (!client) {
			setMessages((prev) =>
				prev.map((m) => (m.id === assistantId ? {
					...m,
					content: '⚠️ Configuration Error: Missing `PUBLIC_LLM_API_KEY` in environment variables. Please configure it to use AI Chat.',
					updateAt: Date.now()
				} : m))
			);
			return;
		}

		setStreamingId(assistantId);
		isStreamingRef.current = true;
		setIsStreaming(true);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const response = await client.chat.completions.create({
				model: defaultModel,
				messages: history.map((m) => ({ role: m.role, content: m.content })),
				stream: true
			}, {
				signal: controller.signal
			});

			let content = '';
			for await (const chunk of response) {
				const delta = chunk.choices[0]?.delta?.content;
				if (!delta) continue;
				content += delta;
				const updatedAt = Date.now();
				setMessages((prev) =>
					prev.map((m) => (m.id === assistantId ? { ...m, content, updateAt: updatedAt } : m))
				);
			}
		} catch (err) {
			if ((err as Error)?.name === 'AbortError') return;
			const msg = (err as Error)?.message || String(err);
			setMessages((prev) =>
				prev.map((m) => (m.id === assistantId ? { ...m, content: `Error: ${msg}`, updateAt: Date.now() } : m))
			);
		} finally {
			abortRef.current = null;
			isStreamingRef.current = false;
			setIsStreaming(false);
			setStreamingId(null);
		}
	}, [defaultModel, stop]);

	const onSubmit = useCallback(
		(value: string) => {
			if (isStreaming) return;
			const trimmed = value.trim();
			if (!trimmed) return;
			setInput('');
			void sendText(trimmed);
		},
		[isStreaming, sendText]
	);

	const title = useMemo(
		() => (
			<div className="flex items-center gap-2">
				<div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20">
					<Bot size={16} />
				</div>
				<div className="leading-tight">
					<div className="text-sm font-semibold">AI 助手</div>
				</div>
			</div>
		),
		[]
	);

	const extra = useMemo(
		() => (
			<div className="flex items-center gap-1">
				{isStreaming ? (
					<Button size="small" type="text" icon={<Square size={16} />} onClick={stop}>
						Stop
					</Button>
				) : null}
				<Button size="small" type="text" icon={<Eraser size={16} />} onClick={clear}>
					Clear
				</Button>
			</div>
		),
		[clear, isStreaming, stop]
	);

	const bubbleItems = useMemo(
		() =>
			messages.map((m) => {
				const role = m.role === 'assistant' ? 'ai' : m.role;
				return {
					key: m.id,
					role,
					content: m.content,
					streaming: isStreaming && m.id === streamingId,
					loading: isStreaming && m.id === streamingId && m.content.trim().length === 0
				};
			}),
		[isStreaming, messages, streamingId]
	);

	const bubbleRole = useMemo(
		() => ({
			ai: {
				placement: 'start' as const,
				avatar: (
					<div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20">
						<Bot size={16} />
					</div>
				),
				contentRender: (content: unknown, info: { key?: string | number }) => (
					<XMarkdown
						content={String(content ?? '')}
						streaming={{ hasNextChunk: isStreaming && info?.key === streamingId }}
					/>
				)
			},
			user: {
				placement: 'end' as const,
				avatar: (
					<div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 ring-1 ring-black/10">
						<User size={16} />
					</div>
				),
				contentRender: (content: unknown) => <XMarkdown content={String(content ?? '')} />
			},
			system: {
				placement: 'start' as const,
				contentRender: (content: unknown) => <XMarkdown content={String(content ?? '')} />
			}
		}),
		[isStreaming, streamingId]
	);

	useEffect(() => {
		if (!analyzeSelection) return;
		const selectionText = analyzeSelection.selectionText.trim();
		if (!selectionText) return;

		const nextKey = `${selectionText}\n${analyzeSelection.article}`;
		if (lastAnalyzeKeyRef.current !== nextKey) {
			lastAnalyzeKeyRef.current = nextKey;
			stop();
			setMessages([]);
			setInput('');
		}

		const prompt = [
			`请对英文 "${selectionText}" 进行解析：`,
			'- 从中文母语的角度出发讲解思维差异',
			'- 从句型,结构,语法角度解析',
			'- 输出保持简洁, 不要超过 300 字',
			'',
			'下面是原文, 你可以作为上下文理解:',
			'',
			analyzeSelection.article
		].join('\n');

		void sendText(prompt);
	}, [analyzeSelection, sendText, stop]);

	return (
		<Drawer
			title={title}
			placement="right"
			open={isOpen}
			onClose={onClose}
			size={640}
			mask={false}
			extra={extra}
			rootClassName={className}
			styles={{
				body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }
			}}
		>
			<div className="flex-1 overflow-hidden px-4 py-3">
				<Bubble.List items={bubbleItems} role={bubbleRole} autoScroll style={{ height: '100%' }} />
			</div>

			<div className="border-t border-black/10 px-3 py-2">
				<Sender
					value={input}
					onChange={(value) => setInput(value)}
					onSubmit={onSubmit}
					onCancel={stop}
					loading={isStreaming}
					placeholder="输入消息..."
					submitType="enter"
					autoSize={{ minRows: 2, maxRows: 6 }}
				/>
				<div className="mt-1 text-center text-[10px] opacity-60">Powered by Ant Design X</div>
			</div>
		</Drawer>
	);
}

