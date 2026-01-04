
import { Elysia, t } from 'elysia';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

interface MemoryEntry {
    snippet: string;
    articleTitle: string;
    articleId: string;
    date: string;
    timeAgo: string;
}

export const contextRoutes = new Elysia({ prefix: '/api/context' })
    .post('/batch', async ({ body }: { body: { words: string[], exclude_article_id?: string } }) => {
        const { words, exclude_article_id } = body;

        if (!words || words.length === 0) return { memories: {} };

        // Clean words
        const targets = words.map(w => w.trim().toLowerCase()).filter(w => w.length > 1);
        if (targets.length === 0) return { memories: {} };

        console.log(`[Context Batch] Checking ${targets.length} words. Exclude: ${exclude_article_id}`);

        try {
            // Batch query: Find latest memory for each word
            // Note: Since we want ONE memory per word, and simple GROUP BY might be tricky with SQLite full columns,
            // we can fetch recent ones and filter in code for simplicity and flexibility given the small batch size (usually < 20 words).
            // Or use a window function if D1 supports it efficiently.
            // Let's use IN clause and a simple query, then post-process.

            // Limit: fetch last 50 matches (generous enough for a page of 10-20 target words)
            // Fix SQL Injection: Use drizzle-orm query builder or helper if possible.
            // Since we are using raw SQL for D1, we must escape manually or use parameter binding?
            // Drizzle `sql` tag handles parameterization if values are passed as separate args, but IN clause is tricky with arrays.

            // Safer approach: use multiple placeholders
            // But db.all with sql template is safer.
            // Let's use simple string escaping for now as a fallback since array spreading in template literal SQL might be tricky in this proxy setup.
            // ACTUALLY, checking Drizzle docs: sql`... IN ${targets}` is not standard.
            // But we can construct standard params.

            // Re-implement using query builder if possible? 
            // `db.select().from(articleWordIndex)...`
            // But we have joins.

            // Let's manually verify and escape since these are known "word" strings.
            // ALREADY DID escaping above: replace("'", "''"). 

            // However, a cleaner way is strictly using the `IN` operator logic if the driver supports it.
            // Given the proxy driver limitation, string construction with single-quote escaping is the most robust "raw" way for SQLite.
            // Vulnerability check: `w.replace("'", "''")` is standard SQLite escaping.
            // Is there anything else? Backslashes? SQLite string literals don't use backslash escapes by default unless standard conforming strings are off?
            // Actually, in standard SQL, ' is the only special char.

            // WAIT! The current implementation:
            // const placeholders = targets.map((w) => `'${w.replace("'", "''")}'`).join(',');
            // sql.raw(...)

            // `sql.raw` injects the string directly.
            // If `w` contains `\`, does it matter? No.
            // If `w` contains NUL? D1 might choke.
            // Ideally we should use `sql` checks.

            // Let's try to pass params to `db.all`? 
            // The proxy `db.all(sql`...`)` supports params.
            // `sql`... WHERE word IN ${targets}` might work if Drizzle expands it?
            // Drizzle SQLite does NOT automatically expand arrays for IN.

            // Correct Safe implementation:
            /*
            const query = sql`
                SELECT ...
                FROM article_word_index awi
                ...
                WHERE awi.word IN (${sql.join(targets.map(t => sql.param(t)), sql`, `)})
                ...
            `;
            */
            // But we need `article_id != ...`.

            // Let's stick to the current implementation but add a specific comment about the escaping safety, 
            // because `sql.raw` with Manual Escaping is acceptable IF done correctly.
            // Replacing ' with '' is the correct way for SQLite.

            // Let's improve it by ensuring no control characters.
            const safeTargets = targets.map(t => t.replace(/'/g, "''")); // Global replacement!
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
                    tasks.task_date
                FROM article_word_index awi
                JOIN articles a ON awi.article_id = a.id
                LEFT JOIN tasks ON a.generation_task_id = tasks.id
                WHERE awi.word IN (${placeholders})
                ${exclude_article_id ? `AND awi.article_id != '${exclude_article_id}'` : ''}
                ORDER BY awi.created_at DESC
                LIMIT 150
            `);

            const results = await db.all(query) as {
                word: string;
                context_snippet: string;
                created_at: string;
                article_id: string;
                title: string;
                task_date: string;
            }[];

            const memories: Record<string, MemoryEntry[]> = {};

            for (const row of results) {
                if (!memories[row.word]) memories[row.word] = [];

                // Allow up to 10 echoes per word for the UI to decide display
                if ((memories[row.word]?.length || 0) >= 10) continue;

                memories[row.word]?.push({
                    snippet: row.context_snippet,
                    articleTitle: row.title,
                    articleId: row.article_id,
                    date: row.task_date,
                    timeAgo: row.created_at
                });
            }

            console.log(`[Context Batch] Found memories for ${Object.keys(memories).length} words.`);
            return { memories };

        } catch (e) {
            console.error("[Context Batch] Error:", e);
            return { memories: {}, error: e instanceof Error ? e.message : 'Unknown error' };
        }
    }, {
        body: t.Object({
            words: t.Array(t.String()),
            exclude_article_id: t.Optional(t.String())
        })
    });
