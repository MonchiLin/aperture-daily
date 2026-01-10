/**
 * Isomorphic Slug Utility (同构 Slug 生成器)
 * 
 * 设计意图：
 * 保证文章 URL 在前端路由和后端生成中保持严格一致。
 * 
 * 为什么不使用标准库 (如 slugify)?
 * 1. 我们的新闻源是国际化的 (包括德语、法语人名地名)。标准 slugify 经常直接丢弃非 ASCII 字符。
 * 2. 我们需要自定义的 Transliteration (音译/转写) 规则，例如将德语 'ü' 转写为 'u' 而不是删除。
 * 3. 我们需要保留中文字符 (CJK Compatibility)，因为可能有中文文章或中英混排标题。
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
