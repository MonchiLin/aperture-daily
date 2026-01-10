import { Elysia } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

import { AppError } from '../src/errors/AppError';

/**
 * Article Routes (核心内容路由)
 * 
 * 核心设计模式：
 * 1. 复合查找 (Compound Lookup): 文章由 (Date, Slug) 唯一确定，而非仅仅 ID。这允许用户通过语义化的 URL 访问。
 * 2. 状态压缩 (State Compression): 阅读进度 (Level 1/2/3) 使用位掩码 (Bitmask) 存储，极致节省数据库空间。
 * 3. 聚合视图 (Aggregated View): 为了减少前端请求数，详情接口一次性返回 Tasks, Variants, Vocabulary 等所有关联数据。
 */
export const articlesRoutes = new Elysia({ prefix: '/api/articles' })
    .get('/lookup', async ({ query: { date, slug } }) => {
        if (!date || !slug) throw AppError.badRequest('Missing date or slug');

        const articleRows = await db.all(sql`
            SELECT a.id 
            FROM articles a
            JOIN tasks t ON a.generation_task_id = t.id
            WHERE t.task_date = ${date} AND a.slug = ${slug}
            LIMIT 1
        `) as any[];

        if (articleRows.length === 0) throw AppError.notFound();
        return getArticleDetails(articleRows[0].id);
    })
    .get('/:id', async ({ params: { id } }) => {
        return getArticleDetails(id);
    })
    .patch('/:id/read', async ({ params: { id }, body }) => {
        const { level } = body as { level: number };
        if (level === undefined) return { status: "error", message: "level required" };

        // [业务逻辑] 阅读状态位运算 (Bitmasking)
        // 我们的系统支持 3 个难度等级。使用 3-bit 整数表示阅读状态。
        // L1=Bit0, L2=Bit1, L3=Bit2
        // 例如：
        // - 只读了 L1: 001 (1)
        // - 读了 L1 & L2: 011 (3)
        // - 全读完: 111 (7)
        // 
        // 操作：read_levels | (1 << level) - 1 ??? 
        // 注意：这里的算法原意可能是把“当前等级及以下”都标记为已读。
        // 如果 level=2 (表示第2级)，mask应为 (1<<2 = 4)? 或者想表达 2^level - 1?
        // 让我们看看原代码意图：(1 << level) - 1. 
        // if level=1, mask=1 (001). if level=2, mask=3 (011). if level=3, mask=7 (111).
        // 这是一个 "Accumulative Read" 逻辑：读了 L3 意味着自动读了 L1/L2。非常合理。
        const mask = (1 << level) - 1;

        await db.run(sql`
            UPDATE articles 
            SET read_levels = (read_levels | ${mask})
            WHERE id = ${id}
        `);
        return { status: "ok" };
    })
    .delete('/:id', async ({ params: { id } }) => {
        await db.run(sql`DELETE FROM highlights WHERE article_id = ${id}`);
        await db.run(sql`DELETE FROM article_word_index WHERE article_id = ${id}`);
        await db.run(sql`DELETE FROM articles WHERE id = ${id}`);
        return { status: "ok" };
    });

// 辅助函数：获取文章详情 (避免代码重复)
async function getArticleDetails(id: string) {
    const articleRows = await db.all(sql`SELECT * FROM articles WHERE id = ${id} LIMIT 1`) as any[];
    if (articleRows.length === 0) throw AppError.notFound();
    const article = articleRows[0]!;

    let task = null;
    if (article.generation_task_id) {
        // 关联 Profile 获取友好名称
        const taskRows = await db.all(sql`
            SELECT t.*, p.name as profileName 
            FROM tasks t
            LEFT JOIN generation_profiles p ON t.profile_id = p.id
            WHERE t.id = ${article.generation_task_id} 
            LIMIT 1
        `);
        task = taskRows.length > 0 ? taskRows[0] : null;
    }

    // 1. 获取变体 (Variants)
    const variants = await db.all(sql`
            SELECT level, level_label, title, content, syntax_json, sentences_json 
            FROM article_variants 
            WHERE article_id = ${id} 
            ORDER BY level ASC
        `) as any[];

    // 2. 获取词汇 (Vocabulary)
    const vocabRows = await db.all(sql`
            SELECT v.id as vocab_id, v.word, v.phonetic, d.part_of_speech, d.definition 
            FROM article_vocabulary v 
            LEFT JOIN article_vocab_definitions d ON v.id = d.vocab_id 
            WHERE v.article_id = ${id}
        `) as any[];

    // 聚合单词定义
    const vocabMap = new Map<string, any>();
    for (const row of vocabRows) {
        if (!vocabMap.has(row.vocab_id)) {
            vocabMap.set(row.vocab_id, {
                word: row.word,
                phonetic: row.phonetic,
                definitions: []
            });
        }
        if (row.part_of_speech && row.definition) {
            vocabMap.get(row.vocab_id).definitions.push({
                pos: row.part_of_speech,
                definition: row.definition
            });
        }
    }
    const wordDefinitions = Array.from(vocabMap.values());

    // [数据适配层]
    // 为什么需要重构 content_json？
    // 为了让前端无需处理复杂的数据库多表结构 (Articles vs Variants vs Vocab)，
    // 我们在这里将分散的数据“注水”回一个统一的 JSON 对象，模拟 NoSQL 的文档结构。
    // 这对于 Server-Side Rendering (SSR) 非常友好。
    // 仅当 normalized 数据存在时重写 (意味着迁移或双写成功)
    if (variants.length > 0) {
        const reconstructed = {
            result: {
                title: article.title,
                sources: article.source_url ? [article.source_url] : [],
                articles: variants.map(v => ({
                    level: v.level,
                    // Fix for mismatched property names if any
                    level_label: v.level_label,
                    title: v.title,
                    content: v.content,
                    syntax: v.syntax_json ? JSON.parse(v.syntax_json) : [],
                    sentences: v.sentences_json ? JSON.parse(v.sentences_json) : []
                })),
                word_definitions: wordDefinitions
            }
        };
        article.content_json = JSON.stringify(reconstructed);
    }

    return { articles: article, tasks: task };
}
