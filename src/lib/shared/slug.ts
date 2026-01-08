/**
 * Isomorphic Slug Utility
 * 
 * 同构模块：前端和后端共享相同的 slug 生成逻辑
 * 
 * Usage:
 *   Frontend: import { toArticleSlug } from '@/lib/shared/slug';
 *   Backend:  import { toArticleSlug } from '../../src/lib/shared/slug';
 */

/**
 * Character map for transliteration (common cases for news articles)
 */
const charMap: Record<string, string> = {
    // German umlauts
    'ü': 'u', 'Ü': 'U', 'ö': 'o', 'Ö': 'O', 'ä': 'a', 'Ä': 'A', 'ß': 'ss',
    // French accents
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u',
    'ý': 'y', 'ÿ': 'y',
    'ñ': 'n', 'ç': 'c',
    'æ': 'ae', 'œ': 'oe',
    // Turkish special chars
    'ş': 's', 'Ş': 'S', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
    // Symbols
    '&': 'and', '@': 'at',
};

/**
 * Convert title to URL-friendly slug
 * 
 * Logic:
 * 1. Normalize Unicode (NFC)
 * 2. Transliterate special characters (e.g., 'ü' → 'u')
 * 3. Lowercase
 * 4. Keep alphanumeric, spaces, hyphens, and Chinese characters
 * 5. Replace spaces/underscores with hyphens
 * 6. Trim leading/trailing hyphens
 */
export function toArticleSlug(title: string): string {
    return title
        .normalize()
        .split('')
        .map(ch => charMap[ch] ?? ch)
        .join('')
        .toLowerCase()
        .trim()
        .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
