/**
 * Word Tokenizer using Intl.Segmenter
 * 
 * Tokenizes English text into words with precise character offsets.
 * Used by Stage 4 Grammar Analysis to enable word-index based structure tagging.
 */

export interface Token {
    id: number;      // Word index (0, 1, 2...)
    word: string;    // The actual word text
    start: number;   // Character offset start (inclusive)
    end: number;     // Character offset end (exclusive)
}

// Cached segmenter instance (thread-safe, reusable)
const segmenter = new Intl.Segmenter('en', { granularity: 'word' });

/**
 * Tokenize text into words with position metadata.
 * 
 * @param text - The text to tokenize
 * @returns Array of tokens with id, word, start, end
 * 
 * @example
 * tokenize("The scientists discovered evidence.")
 * // Returns:
 * // [
 * //   { id: 0, word: "The", start: 0, end: 3 },
 * //   { id: 1, word: "scientists", start: 4, end: 14 },
 * //   { id: 2, word: "discovered", start: 15, end: 25 },
 * //   { id: 3, word: "evidence", start: 26, end: 34 },
 * // ]
 */
export function tokenize(text: string): Token[] {
    const segments = segmenter.segment(text);
    const tokens: Token[] = [];
    let wordIndex = 0;

    for (const segment of segments) {
        // Only include word-like segments (not punctuation or whitespace)
        if (segment.isWordLike) {
            tokens.push({
                id: wordIndex++,
                word: segment.segment,
                start: segment.index,
                end: segment.index + segment.segment.length
            });
        }
    }

    return tokens;
}

/**
 * Convert a word index range to character offsets.
 * 
 * @param tokens - The full token array from tokenize()
 * @param wordStart - Starting word index (inclusive)
 * @param wordEnd - Ending word index (inclusive)
 * @returns Character offset range { start, end }
 * @throws Error if indices are out of bounds
 * 
 * @example
 * const tokens = tokenize("The quick brown fox");
 * tokenRangeToCharOffset(tokens, 1, 2) 
 * // Returns: { start: 4, end: 15 } for "quick brown"
 */
export function tokenRangeToCharOffset(
    tokens: Token[],
    wordStart: number,
    wordEnd: number
): { start: number; end: number } {
    if (wordStart < 0 || wordStart >= tokens.length) {
        throw new Error(`Word start index ${wordStart} out of bounds [0, ${tokens.length - 1}]`);
    }
    if (wordEnd < wordStart || wordEnd >= tokens.length) {
        throw new Error(`Word end index ${wordEnd} out of bounds [${wordStart}, ${tokens.length - 1}]`);
    }

    const startToken = tokens[wordStart]!;
    const endToken = tokens[wordEnd]!;

    return {
        start: startToken.start,
        end: endToken.end
    };
}

/**
 * Format tokens for LLM prompt display.
 * 
 * @param tokens - Token array
 * @returns Numbered word list string
 * 
 * @example
 * formatTokensForPrompt(tokenize("Hello world"))
 * // Returns:
 * // "[0] Hello\n[1] world"
 */
export function formatTokensForPrompt(tokens: Token[]): string {
    return tokens.map(t => `[${t.id}] ${t.word}`).join('\n');
}

/**
 * Get the extract text for a word range.
 * 
 * @param text - Original text
 * @param tokens - Token array
 * @param wordStart - Starting word index
 * @param wordEnd - Ending word index
 * @returns The extracted substring
 */
export function extractTextForRange(
    text: string,
    tokens: Token[],
    wordStart: number,
    wordEnd: number
): string {
    const range = tokenRangeToCharOffset(tokens, wordStart, wordEnd);
    return text.substring(range.start, range.end);
}
