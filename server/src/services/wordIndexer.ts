
import { db } from '../db/client';
import { articleWordIndex } from '../../db/schema';

interface InputWords {
    selected?: string[];
    new?: string[];
    review?: string[];
}

interface ArticleContent {
    content: string;
    word_count?: number;
}

interface ContentJson {
    input_words?: InputWords;
    result?: {
        articles?: ArticleContent[];
    };
}

interface WordIndexEntry {
    id: string;
    word: string;
    articleId: string;
    contextSnippet: string;
    role: 'keyword' | 'entity';
    createdAt: string;
}

// Helper to sanitize words for indexing
function sanitizeWord(w: string) {
    return w.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Split text into sentences for context extraction
 */
function splitIntoSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
}

/**
 * Article Word Indexer (文章单词索引器)
 * 
 * 核心功能：
 * 为文章中出现的“目标单词”建立倒排索引 (Inverted Index) 和上下文片段 (Context Snippet)。
 * 这使得前端可以实现：
 * 1. 单词高亮 (Highlighting)。
 * 2. 点击单词显示“原文例句” (Usage in Context)。
 * 3. 跨文章搜索单词历史。
 * 
 * 严格模式 (STRICT MODE):
 * 我们仅索引那些明确列在 `input_words` (Selected/New/Review) 中的单词。
 * 不会自动索引文章中出现的其他随机单词，以保持知识图谱的整洁和相关性。
 */
export async function indexArticleWords(articleId: string, contentJson: ContentJson) {
    if (!contentJson || !contentJson.result || !contentJson.result.articles) {
        console.warn(`[WordIndexer] Invalid content JSON for article ${articleId}`);
        return;
    }

    // 1. 收集目标单词 (Keywords & Entities)
    // 为什么需要去重？ input_words 中的 new/review 列表可能有重叠，或者与 selected 重叠。
    // 使用 Set 确保每个单词只处理一次。
    const inputWords = contentJson.input_words || {};
    const targets = new Set<string>();

    if (Array.isArray(inputWords.selected)) inputWords.selected.forEach((w: string) => targets.add(w));
    if (Array.isArray(inputWords.new)) inputWords.new.forEach((w: string) => targets.add(w));
    if (Array.isArray(inputWords.review)) inputWords.review.forEach((w: string) => targets.add(w));

    if (targets.size === 0) {
        console.log(`[WordIndexer] No target words to index for ${articleId}`);
        return;
    }

    console.log(`[WordIndexer] Indexing ${targets.size} words for article ${articleId}`);

    // 2. 准备搜索语料 (Prepare Corpus)
    // 一篇文章有多个 Level (L1/L2/L3)。
    // 策略：选择字数最多 (通常是 L3) 的变体作为搜索源。
    // 这样能找到最完整、最丰富的例句上下文。
    const articles = contentJson.result.articles as ArticleContent[];
    const mainArticle = articles.sort((a, b) => (b.word_count || 0) - (a.word_count || 0))[0];

    if (!mainArticle || !mainArticle.content) {
        console.warn(`[WordIndexer] No article content found for ${articleId}`);
        return;
    }

    const sentences = splitIntoSentences(mainArticle.content);
    const entriesToInsert: WordIndexEntry[] = [];

    // 3. Find unique context for each target word
    for (const rawWord of targets) {
        const word = sanitizeWord(rawWord);
        if (word.length < 2) continue; // Skip single chars

        // Find the best sentence containing this word
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        const matchedSentence = sentences.find(s => regex.test(s));

        if (matchedSentence) {
            // 上下文截断 (Snippet Truncation)
            // 数据库列通常有长度限制 (即使是 TEXT 也不建议存太长)。
            // 且前端显示卡片时空间有限。
            // 算法：以单词为中心，前后各取 ~80 字符，并添加省略号。
            let snippet = matchedSentence.trim();
            if (snippet.length > 200) {
                const matchIndex = snippet.toLowerCase().indexOf(word);
                // 确保 start 索引不越界
                const start = Math.max(0, matchIndex - 80);
                const end = Math.min(snippet.length, matchIndex + 80);
                snippet = (start > 0 ? '...' : '') + snippet.substring(start, end) + (end < snippet.length ? '...' : '');
            }

            entriesToInsert.push({
                id: crypto.randomUUID(),
                word: word,
                articleId: articleId,
                contextSnippet: snippet,
                role: 'keyword',
                createdAt: new Date().toISOString()
            });
        }
    }

    // 4. Batch Insert (Upsert to avoid duplicates)
    if (entriesToInsert.length > 0) {
        try {
            // Use onConflictDoNothing for simplicity - if word+article already exists, skip it
            await db.insert(articleWordIndex)
                .values(entriesToInsert)
                .onConflictDoNothing();
            console.log(`[WordIndexer] Successfully indexed ${entriesToInsert.length} words.`);
        } catch (e) {
            console.error(`[WordIndexer] Failed to insert index:`, e);
        }
    }
}
