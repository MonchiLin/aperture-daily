/**
 * Tests for the tokenizer module
 */

import { describe, it, expect } from 'bun:test';
import { tokenize, tokenRangeToCharOffset, formatTokensForPrompt, extractTextForRange } from './tokenizer';

describe('tokenize', () => {
    it('should tokenize simple sentence', () => {
        const tokens = tokenize('Hello world');
        expect(tokens).toHaveLength(2);
        expect(tokens[0]).toEqual({ id: 0, word: 'Hello', start: 0, end: 5 });
        expect(tokens[1]).toEqual({ id: 1, word: 'world', start: 6, end: 11 });
    });

    it('should exclude punctuation as standalone tokens', () => {
        const tokens = tokenize('Hello, world!');
        expect(tokens).toHaveLength(2);
        expect(tokens[0]?.word).toBe('Hello');
        expect(tokens[1]?.word).toBe('world');
    });

    it('should handle multi-word subject correctly', () => {
        const text = 'This important technology show took place in Las Vegas.';
        const tokens = tokenize(text);

        // Should have 9 words
        expect(tokens).toHaveLength(9);
        expect(tokens[0]?.word).toBe('This');
        expect(tokens[1]?.word).toBe('important');
        expect(tokens[2]?.word).toBe('technology');
        expect(tokens[3]?.word).toBe('show');
        expect(tokens[7]?.word).toBe('Las');
        expect(tokens[8]?.word).toBe('Vegas');
    });

    it('should preserve correct character offsets', () => {
        const text = 'The quick brown fox';
        const tokens = tokenize(text);

        // Verify each word can be extracted from original text using offsets
        for (const token of tokens) {
            const extracted = text.substring(token.start, token.end);
            expect(extracted).toBe(token.word);
        }
    });

    it('should handle multi-paragraph text', () => {
        const text = 'First paragraph.\n\nSecond paragraph.';
        const tokens = tokenize(text);

        expect(tokens[0]?.word).toBe('First');
        expect(tokens[1]?.word).toBe('paragraph');
        expect(tokens[2]?.word).toBe('Second');
        expect(tokens[3]?.word).toBe('paragraph');

        // Verify offsets work across newlines
        expect(text.substring(tokens[2]!.start, tokens[2]!.end)).toBe('Second');
    });
});

describe('tokenRangeToCharOffset', () => {
    it('should convert single word index', () => {
        const tokens = tokenize('The quick brown fox');
        const range = tokenRangeToCharOffset(tokens, 1, 1);

        expect(range.start).toBe(4);  // "quick" starts at index 4
        expect(range.end).toBe(9);    // "quick" ends at index 9
    });

    it('should convert multi-word range', () => {
        const text = 'This important technology show took place';
        const tokens = tokenize(text);

        // "This important technology show" = words 0-3
        const range = tokenRangeToCharOffset(tokens, 0, 3);

        expect(range.start).toBe(0);
        expect(text.substring(range.start, range.end)).toBe('This important technology show');
    });

    it('should throw on invalid start index', () => {
        const tokens = tokenize('Hello world');
        expect(() => tokenRangeToCharOffset(tokens, -1, 0)).toThrow();
        expect(() => tokenRangeToCharOffset(tokens, 5, 5)).toThrow();
    });

    it('should throw on invalid end index', () => {
        const tokens = tokenize('Hello world');
        expect(() => tokenRangeToCharOffset(tokens, 0, 5)).toThrow();
        expect(() => tokenRangeToCharOffset(tokens, 1, 0)).toThrow();
    });
});

describe('formatTokensForPrompt', () => {
    it('should format tokens with indices', () => {
        const tokens = tokenize('Hello world');
        const formatted = formatTokensForPrompt(tokens);

        expect(formatted).toBe('[0] Hello\n[1] world');
    });
});

describe('extractTextForRange', () => {
    it('should extract correct text for word range', () => {
        const text = 'The scientists discovered new evidence';
        const tokens = tokenize(text);

        // "new evidence" = words 3-4
        const extracted = extractTextForRange(text, tokens, 3, 4);
        expect(extracted).toBe('new evidence');
    });
});
