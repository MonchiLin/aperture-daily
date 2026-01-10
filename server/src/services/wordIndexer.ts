/**
 * 文章词汇索引模块
 *
 * 核心职责：将文章中使用的目标词汇建立索引，支持历史回顾和高亮功能
 *
 * 索引策略：
 * 1. 从生成结果中提取所有目标词（selected + new + review）
 * 2. 在文章正文中查找包含该词的句子作为上下文
 * 3. 存入 article_word_index 表，供前端查询
 *
 * 应用场景：
 * - "我学过哪些词？" → 查询 article_word_index
 * - "这个词出现在哪篇文章？" → 通过 word 字段检索
 * - 高亮复现：context_snippet 保存了原始上下文
 */

import type { AppKysely } from '../db/factory';

// ════════════════════════════════════════════════════════════════
// 类型定义
// ════════════════════════════════════════════════════════════════

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

/** 数据库插入行（匹配 DB 的 snake_case 命名） */
interface WordIndexInsertRow {
    id: string;
    word: string;
    article_id: string;
    context_snippet: string;
    role: 'keyword' | 'entity';
    created_at: string;
}

// ════════════════════════════════════════════════════════════════
// 辅助函数
// ════════════════════════════════════════════════════════════════

/**
 * 词汇标准化
 *
 * 转小写 + 移除非字母数字字符
 * 确保 "Apple" 和 "apple" 被视为同一词
 */
function sanitizeWord(w: string) {
    return w.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 按句子拆分文本（用于提取上下文） */
function splitIntoSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
}

// ════════════════════════════════════════════════════════════════
// 主函数
// ════════════════════════════════════════════════════════════════

/**
 * 为文章建立词汇索引
 *
 * @param articleId - 文章 ID
 * @param contentJson - 生成结果 JSON（包含目标词和文章内容）
 *
 * 执行流程：
 * 1. 收集所有目标词
 * 2. 选择字数最多的文章作为上下文来源（通常是 Level 3）
 * 3. 对每个目标词查找包含它的句子
 * 4. 批量插入索引记录
 */
export async function indexArticleWords(db: AppKysely, articleId: string, contentJson: ContentJson) {
    if (!contentJson || !contentJson.result || !contentJson.result.articles) {
        console.warn(`[WordIndexer] Invalid content JSON for article ${articleId}`);
        return;
    }

    // 收集所有目标词
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

    // 选择字数最多的文章作为上下文来源
    const articles = contentJson.result.articles as ArticleContent[];
    const mainArticle = articles.sort((a, b) => (b.word_count || 0) - (a.word_count || 0))[0];

    if (!mainArticle || !mainArticle.content) {
        console.warn(`[WordIndexer] No article content found for ${articleId}`);
        return;
    }

    const sentences = splitIntoSentences(mainArticle.content);
    const entriesToInsert: WordIndexInsertRow[] = [];

    // 为每个目标词查找上下文
    for (const rawWord of targets) {
        const word = sanitizeWord(rawWord);
        if (word.length < 2) continue;  // 跳过过短的词

        const regex = new RegExp(`\\b${word}\\b`, 'i');
        const matchedSentence = sentences.find(s => regex.test(s));

        if (matchedSentence) {
            // 截取上下文（最多 200 字符，居中于目标词）
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

    // 批量插入索引
    if (entriesToInsert.length > 0) {
        try {
            await db.insertInto('article_word_index')
                .values(entriesToInsert)
                .onConflict((oc) => oc.doNothing())  // 避免重复索引
                .execute();
            console.log(`[WordIndexer] Successfully indexed ${entriesToInsert.length} words.`);
        } catch (e) {
            console.error(`[WordIndexer] Failed to insert index:`, e);
        }
    }
}

