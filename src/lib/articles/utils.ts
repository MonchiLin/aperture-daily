import type { ArticleParsedContent, SidebarWord, WordDefinition } from "./types";
import { dayjs } from "@server/lib/time";

export function parseArticleContent(jsonString: string): ArticleParsedContent {
    try {
        return JSON.parse(jsonString) as ArticleParsedContent;
    } catch (e) {
        throw new Error("Invalid content_json: JSON parse failed");
    }
}

export function extractSources(parsed: ArticleParsedContent): string[] {
    const sources = parsed?.result?.sources;
    if (
        !Array.isArray(sources) ||
        !sources.every((s: unknown) => typeof s === "string")
    ) {
        throw new Error("Invalid content_json: sources must be string[]");
    }
    return sources;
}

export function extractWordDefinitions(
    parsed: ArticleParsedContent,
): WordDefinition[] {
    const defs = parsed?.result?.wordDefinitions;
    if (!Array.isArray(defs)) {
        throw new Error("Invalid content_json: wordDefinitions must be array");
    }
    return defs;
}

export function mapToSidebarWords(defs: WordDefinition[]): SidebarWord[] {
    return defs.map((w) => ({
        word: w.word,
        phonetic: w.phonetic || "",
        definitions: w.definitions || [],
    }));
}


export function formatDateLabel(value?: string | null): string {
    if (!value) return "";
    const date = dayjs.tz(value);
    if (!date.isValid()) return value;

    const weekday = date.locale('en').format('dddd');
    const formattedDate = date.format('YYYY/MM/DD');

    return `${weekday}, ${formattedDate}`;
}

export function getInitialArticleData(parsed: ArticleParsedContent) {
    const articles = parsed?.result?.articles;
    if (!Array.isArray(articles) || articles.length === 0) return null;

    const sorted = [...articles].sort((a, b) => a.level - b.level);
    const current = sorted[0];
    if (!current) return null;

    const text = current.content ?? "";
    const words = text.trim().split(/\s+/).filter(Boolean);
    const count = words.length;
    const minutes = count ? Math.max(1, Math.ceil(count / 120)) : 0;
    const minuteLabel = minutes === 1 ? "minute" : "minutes";

    return {
        content: text,
        readingTime: `${minutes} ${minuteLabel}`,
    };
}
