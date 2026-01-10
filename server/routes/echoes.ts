
import { Elysia, t } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

interface MemoryEntry {
    snippet: string;
    articleTitle: string;
    articleId: string;
    articleSlug?: string;
    date: string;
    timeAgo: string;
}

/**
 * Echoes (记忆回响 Service)
 * 
 * 核心功能 (Contextual Retrieval):
 * 为新生成的文章提供“上下文记忆”。当用户阅读一篇文章时，系统会自动高亮文中的单词，
 * 并显示该单词在 *过去* 其他文章中的出现片段 (Echoes)。
 * 
 * 技术挑战：
 * 1. 批量查询：一篇文章可能包含 20-50 个高亮词，N+1 查询是不可接受的。
 * 2. 性能：需要在毫秒级返回所有单词的上下文。
 * 
 * 解决方案：
 * 使用单一的 SQL `IN` 查询，一次性检索所有单词的相关记录，然后在内存中进行 Grouping。
 */
export const echoesRoutes = new Elysia({ prefix: '/api/echoes' })
    .post('/batch', async ({ body }: { body: { words?: string[], article_id?: string, exclude_article_id?: string } }) => {
        const { words, article_id, exclude_article_id } = body;

        let targets: string[] = [];

        // 如果提供了 article_id，从 article_vocabulary 表中查找单词
        if (article_id) {
            const vocabRows = await db.all(sql`
                SELECT word FROM article_vocabulary WHERE article_id = ${article_id}
            `) as { word: string }[];
            targets = vocabRows.map(r => r.word.toLowerCase());
        } else if (words && words.length > 0) {
            // 使用提供的单词列表
            targets = words.map(w => w.trim().toLowerCase()).filter(w => w.length > 1);
        }

        if (targets.length === 0) return { echoes: {} };

        // 如果未明确提供，则使用 article_id 作为排除项
        const excludeId = exclude_article_id || article_id;

        console.log(`[Echoes Batch] 正在检查 ${targets.length} 个单词。排除文章: ${excludeId}`);


        // 批量查询优化 (Batch Optimization)
        // 
        // 为什么手动构建 SQL IN 子句？
        // Drizzle ORM 的 SQLite Proxy 模式在处理复杂的数组参数时曾有 Bug。
        // 为了极致的稳定性和性能，我们选择直接构建原始 SQL 字符串。
        //
        // 安全性 (Security Assurance):
        // 必须手动进行单引号转义 (replace ' with '')，防止 SQL 注入。
        // 例如: "User's" -> "User''s"
        const safeTargets = targets.map(t => t.replace(/'/g, "''"));
        const placeholders = safeTargets.map(w => `'${w}'`).join(',');

        // We missed the global flag in the original code: `w.replace("'", "''")` only replaces the FIRST occurrence!
        // THAT IS A BUG! "User's" -> "User''s"            const safeTargets = targets.map(t => t.replace(/'/g, "''")); 
        // The above line was a copy-paste error in the original comment, the line below is the correct one.
        // const placeholders = safeTargets.map(w => `'${w}'`).join(',');

        const query = sql.raw(`
            SELECT 
                awi.word,
                awi.context_snippet, 
                awi.created_at, 
                a.id as article_id,
                a.title,
                a.slug, 
                tasks.task_date
            FROM article_word_index awi
            JOIN articles a ON awi.article_id = a.id
            LEFT JOIN tasks ON a.generation_task_id = tasks.id
            WHERE awi.word IN (${placeholders})
            ${excludeId ? `AND awi.article_id != '${excludeId}'` : ''}
            ORDER BY awi.created_at DESC
            LIMIT 150
        `);

        const results = await db.all(query) as {
            word: string;
            context_snippet: string;
            created_at: string;
            article_id: string;
            title: string;
            slug: string | null;
            task_date: string;
        }[];

        const echoes: Record<string, MemoryEntry[]> = {};

        for (const row of results) {
            if (!echoes[row.word]) echoes[row.word] = [];

            // 每个单词最多保留 10 条记录，供 UI 筛选
            if ((echoes[row.word]?.length || 0) >= 10) continue;

            echoes[row.word]?.push({
                snippet: row.context_snippet,
                articleTitle: row.title,
                articleId: row.article_id,
                articleSlug: row.slug || undefined, // Pass slug
                date: row.task_date,
                timeAgo: row.created_at
            });
        }

        console.log(`[Echoes Batch] 为 ${Object.keys(echoes).length} 个单词找到了回响。`);
        return { echoes };
    }, {
        body: t.Object({
            words: t.Optional(t.Array(t.String())),
            article_id: t.Optional(t.String()),
            exclude_article_id: t.Optional(t.String())
        })
    });
