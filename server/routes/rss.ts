import { Elysia, t } from 'elysia';
import { db } from '../src/db/factory';
import { sql } from 'kysely';
import { AppError } from '../src/errors/AppError';

// Schema Definitions
const createSourceSchema = t.Object({
    name: t.String(),
    url: t.String()
});

const updateSourceSchema = t.Object({
    name: t.Optional(t.String()),
    url: t.Optional(t.String()),
    is_active: t.Optional(t.Boolean())
});


const testFetchSchema = t.Object({
    url: t.String()
});

export const rssRoutes = new Elysia({ prefix: '/api/rss' })
    /**
     * GET /api/rss
     * 获取所有 RSS 源列表
     */
    .get('/', async () => {
        const sources = await db.selectFrom('news_sources')
            .selectAll()
            .orderBy('created_at', 'desc')
            .execute();

        return sources.map(s => ({
            ...s,
            is_active: Boolean(s.is_active)
        }));
    })

    /**
     * POST /api/rss
     * 添加新的 RSS 源
     */
    .post('/', async ({ body, set }) => {
        const id = crypto.randomUUID();
        try {
            await db.insertInto('news_sources')
                .values({
                    id,
                    name: body.name,
                    url: body.url,
                    is_active: 1
                })
                .execute();

            set.status = 201;
            return { success: true, id };
        } catch (e: any) {
            if (e.message?.includes('UNIQUE')) {
                throw new AppError(409, 'SOURCE_EXISTS', 'RSS URL already exists');
            }
            throw e;
        }
    }, {
        body: createSourceSchema
    })

    /**
     * PUT /api/rss/:id
     * 更新源信息
     */
    .put('/:id', async ({ params: { id }, body }) => {
        const updateData: any = {
            updated_at: sql`CURRENT_TIMESTAMP`
        };
        if (body.name) updateData.name = body.name;
        if (body.url) updateData.url = body.url;
        if (body.is_active !== undefined) updateData.is_active = body.is_active ? 1 : 0;

        const result = await db.updateTable('news_sources')
            .set(updateData)
            .where('id', '=', id)
            .executeTakeFirst();

        if (result.numUpdatedRows === BigInt(0)) {
            throw new AppError(404, 'NOT_FOUND', 'Source not found');
        }

        return { success: true };
    }, {
        body: updateSourceSchema
    })

    /**
     * DELETE /api/rss/:id
     * 删除源
     */
    .delete('/:id', async ({ params: { id } }) => {
        const result = await db.deleteFrom('news_sources')
            .where('id', '=', id)
            .executeTakeFirst();

        if (result.numDeletedRows === BigInt(0)) {
            throw new AppError(404, 'NOT_FOUND', 'Source not found');
        }
        return { success: true };
    })

    /**
     * POST /api/rss/test-fetch
     * 测试抓取某个 URL (不存库)
     * 用于前端验证 URL 有效性并预览 Feed 内容
     */
    .post('/test-fetch', async ({ body }) => {
        try {
            // 直接使用 rss-parser 进行即时抓取测试
            const Parser = (await import('rss-parser')).default;
            const parser = new Parser({ timeout: 5000 });
            const feed = await parser.parseURL(body.url);

            return {
                success: true,
                title: feed.title,
                itemCount: feed.items?.length || 0,
                // 返回前3条作为预览
                preview: feed.items?.slice(0, 3).map(item => ({
                    title: item.title,
                    link: item.link,
                    date: item.pubDate
                }))
            };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }, {
        body: testFetchSchema
    })

    /**
     * POST /api/rss/import
     * 导入 OPML 内容 (支持直接传内容 或 传 URL 由服务器抓取)
     */
    .post('/import', async ({ body }) => {
        let opml = body.opml_content;

        // 如果提供了 URL，先去抓取内容
        if (body.url) {
            try {
                const res = await fetch(body.url);
                if (!res.ok) throw new Error(`Failed to fetch OPML: ${res.statusText}`);
                opml = await res.text();
            } catch (e: any) {
                return { success: false, message: 'Fetch failed: ' + e.message };
            }
        }

        if (!opml) {
            return { success: false, message: 'No OPML content or URL provided' };
        }

        // 简易 OPML 解析正则
        // <outline text="BBC News - World" type="rss" xmlUrl="http://feeds.bbci.co.uk/news/world/rss.xml" />
        const regex = /<outline[^>]+text="([^"]+)"[^>]+xmlUrl="([^"]+)"/g;
        let match;
        const sources: { name: string, url: string }[] = [];

        while ((match = regex.exec(opml)) !== null) {
            if (match[1] && match[2]) {
                sources.push({
                    name: match[1],
                    url: match[2]
                });
            }
        }

        if (sources.length === 0) {
            return { success: false, message: 'No valid RSS sources found in OPML' };
        }

        let addedCount = 0;
        // 批量插入 (逐个插入以处理冲突，或者 ignore conflict)
        for (const s of sources) {
            try {
                await db.insertInto('news_sources')
                    .values({
                        id: crypto.randomUUID(),
                        name: s.name,
                        url: s.url,
                        is_active: 1
                    })
                    // SQLite ON CONFLICT DO NOTHING
                    .onConflict((oc) => oc.column('url').doNothing())
                    .execute();
                addedCount++;
            } catch (e) {
                // Ignore errors
            }
        }

        return { success: true, totalFound: sources.length, added: addedCount };
    }, {
        body: t.Object({
            opml_content: t.Optional(t.String()),
            url: t.Optional(t.String())
        })
    });
