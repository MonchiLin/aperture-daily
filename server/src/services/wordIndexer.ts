import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { articleWordIndex } from '../../db/schema';

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
 * Indexes specific words from an article with their context.
 * STRICT MODE: Only indexes target words (input_words).
 * 
 * @param articleId The UUID of the article
 * @param contentJson The parsed content JSON of the article
 */
export async function indexArticleWords(articleId: string, contentJson: any) {
    if (!contentJson || !contentJson.result || !contentJson.result.articles) {
        console.warn(`[WordIndexer] Invalid content JSON for article ${articleId}`);
        return;
    }

    // 1. Collect target words (Keywords & Entities)
    // STRICT MODE: We ONLY use words that are explicitly in the input_words lists.
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

    // 2. Prepare content for searching
    const articles = contentJson.result.articles as any[];
    // Use the longest article part (highest word count / level) to find context
    const mainArticle = articles.sort((a, b) => (b.word_count || 0) - (a.word_count || 0))[0];

    if (!mainArticle || !mainArticle.content) {
        console.warn(`[WordIndexer] No article content found for ${articleId}`);
        return;
    }

    const sentences = splitIntoSentences(mainArticle.content);
    const entriesToInsert: any[] = [];

    // 3. Find unique context for each target word
    for (const rawWord of targets) {
        const word = sanitizeWord(rawWord);
        if (word.length < 2) continue; // Skip single chars

        // Find the best sentence containing this word
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        const matchedSentence = sentences.find(s => regex.test(s));

        if (matchedSentence) {
            // Trim to fit context limit (~150 chars)
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
            await db.insert(articleWordIndex)
                .values(entriesToInsert)
                .onConflictDoUpdate({
                    target: [articleWordIndex.word, articleWordIndex.articleId],
                    set: {
                        contextSnippet: sql`excluded.context_snippet`,
                        createdAt: sql`CURRENT_TIMESTAMP`
                    }
                });
            console.log(`[WordIndexer] Successfully indexed ${entriesToInsert.length} words.`);
        } catch (e) {
            console.error(`[WordIndexer] Failed to insert index:`, e);
        }
    }
}
