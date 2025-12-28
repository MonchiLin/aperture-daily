import type { DailyNewsOutput } from '../schemas/dailyNews';
import { WORD_SELECTION_MAX_WORDS } from './llmLimits';

// openaiCompatible 辅助函数
function ensureContentParagraphs(content: string, level: number) {
	const text = content.replace(/\r\n/g, '\n').trim();
	if (!text) return text;
	if (/\n\s*\n/.test(text)) {
		const paragraphs = text
			.split(/\n\s*\n+/)
			.map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim())
			.filter(Boolean);
		return paragraphs.join('\n\n');
	}
	const flattened = text.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
	if (!flattened) return flattened;
	const withLines = flattened.replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n');
	const sentences = withLines
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
	if (sentences.length <= 1) return flattened;
	const desiredParagraphs = level === 1 ? 2 : level === 2 ? 2 : 3;
	const perParagraph = Math.max(2, Math.ceil(sentences.length / desiredParagraphs));
	const paragraphs: string[] = [];
	for (let i = 0; i < sentences.length; i += perParagraph) {
		paragraphs.push(sentences.slice(i, i + perParagraph).join(' '));
	}
	return paragraphs.join('\n\n');
}

export function normalizeDailyNewsOutput(output: DailyNewsOutput): DailyNewsOutput {
	return {
		...output,
		articles: output.articles.map((a) => ({
			...a,
			content: ensureContentParagraphs(a.content, a.level)
		}))
	};
}

function normalizeUrl(raw: string) {
	return raw
		.trim()
		.replace(/^<+/, '')
		.replace(/>+$/, '')
		.replace(/[)\]}>.,;:，。；：]+$/, '');
}

function normalizeWordList(words: string[]) {
	const unique = Array.from(
		new Set(words.map((word) => word.trim()).filter(Boolean))
	);
	return unique.slice(0, WORD_SELECTION_MAX_WORDS);
}

function pickWordList(raw: unknown): string[] | null {
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		return trimmed ? [trimmed] : null;
	}
	if (!Array.isArray(raw)) return null;
	const direct = raw
		.filter((item) => typeof item === 'string')
		.map((word) => word.trim())
		.filter(Boolean);
	if (direct.length > 0) return normalizeWordList(direct);
	const fromObjects = raw
		.map((item) => {
			if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
			const word = (item as Record<string, unknown>).word;
			return typeof word === 'string' ? word.trim() : null;
		})
		.filter((word): word is string => Boolean(word));
	if (fromObjects.length > 0) return normalizeWordList(fromObjects);
	return null;
}

function pickSelectionReasoning(obj: Record<string, unknown>) {
	const raw =
		obj.selection_reasoning ??
		obj.selectionReasoning ??
		obj.reasoning ??
		obj.reason ??
		obj.rationale ??
		obj.selection_rationale;
	if (typeof raw !== 'string') return undefined;
	const trimmed = raw.trim();
	return trimmed ? trimmed : undefined;
}

// 选词 JSON 容错：仅允许 selected_words 字段，不再做模糊匹配
export function normalizeWordSelectionPayload(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const obj = value as Record<string, unknown>;

	// Strict mode: Only look for 'selected_words'
	// If strictness is paramount, we should not look for aliases.
	const selectedWords = pickWordList(obj.selected_words);

	if (!selectedWords?.length) return value;

	const normalized: Record<string, unknown> = {
		...obj,
		selected_words: selectedWords
	};

	if (typeof obj.selection_reasoning !== 'string') {
		const reasoning = pickSelectionReasoning(obj);
		if (reasoning) normalized.selection_reasoning = reasoning;
	}
	return normalized;
}

export function extractHttpUrlsFromText(text: string): string[] {
	const matches = text.match(/https?:\/\/[^\s<>()\[\]]+/g) ?? [];
	return matches.map(normalizeUrl).filter(Boolean);
}

export function collectHttpUrlsFromUnknown(value: unknown): string[] {
	const urls: string[] = [];
	const seen = new Set<unknown>();
	const walk = (v: unknown) => {
		if (v == null) return;
		if (typeof v === 'string') {
			urls.push(...extractHttpUrlsFromText(v));
			return;
		}
		if (typeof v !== 'object') return;
		if (seen.has(v)) return;
		seen.add(v);
		if (Array.isArray(v)) {
			for (const item of v) walk(item);
			return;
		}
		for (const item of Object.values(v as Record<string, unknown>)) walk(item);
	};
	walk(value);
	return urls;
}

// 将响应输出追加到历史（多轮对话）
export function appendResponseToHistory(history: any[], response: any): any[] {
	return [
		...history,
		...response.output.map(({ id, ...rest }: any) => rest)
	];
}
