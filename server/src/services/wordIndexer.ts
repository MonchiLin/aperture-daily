import type { AppKysely } from '../db/factory';

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

// Internal type for batch insert matching DB schema (snake_case)
interface WordIndexInsertRow {
    id: string;
    word: string;
    article_id: string;
    context_snippet: string;
    role: 'keyword' | 'entity';
    created_at: string;
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
 * Article Word Indexer (Kysely Edition)
 */
export async function indexArticleWords(db: AppKysely, articleId: string, contentJson: ContentJson) {
    if (!contentJson || !contentJson.result || !contentJson.result.articles) {
        console.warn(`[WordIndexer] Invalid content JSON for article ${articleId}`);
        return;
    }

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

    const articles = contentJson.result.articles as ArticleContent[];
    const mainArticle = articles.sort((a, b) => (b.word_count || 0) - (a.word_count || 0))[0];

    if (!mainArticle || !mainArticle.content) {
        console.warn(`[WordIndexer] No article content found for ${articleId}`);
        return;
    }

    const sentences = splitIntoSentences(mainArticle.content);
    const entriesToInsert: WordIndexInsertRow[] = [];

    // Find unique context
    for (const rawWord of targets) {
        const word = sanitizeWord(rawWord);
        if (word.length < 2) continue;

        const regex = new RegExp(`\\b${word}\\b`, 'i');
        const matchedSentence = sentences.find(s => regex.test(s));

        if (matchedSentence) {
            let snippet = matchedSentence.trim();
            if (snippet.length > 200) {
                const matchIndex = snippet.toLowerCase().indexOf(word);
                const start = Math.max(0, matchIndex - 80);
                const end = Math.min(snippet.length, matchIndex + 80);
                snippet = (start > 0 ? '...' : '') + snippet.substring(start, end) + (end < snippet.length ? '...' : '');
            }

            entriesToInsert.push({
                id: crypto.randomUUID(),
                word: word,
                article_id: articleId,
                context_snippet: snippet,
                role: 'keyword',
                created_at: new Date().toISOString()
            });
        }
    }

    if (entriesToInsert.length > 0) {
        try {
            await db.insertInto('article_word_index')
                .values(entriesToInsert)
                .onConflict((oc) => oc.doNothing())
                .execute();
            console.log(`[WordIndexer] Successfully indexed ${entriesToInsert.length} words.`);
        } catch (e) {
            console.error(`[WordIndexer] Failed to insert index:`, e);
        }
    }
}
