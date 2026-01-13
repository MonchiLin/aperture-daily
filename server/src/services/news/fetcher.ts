import Parser from 'rss-parser';
import { db } from '../../db/factory';
import { sql } from 'kysely';
import type { NewsItem } from '../llm/types';

/**
 * NewsFetcher 服务
 * 负责从 RSS 源实时抓取新闻数据的核心服务。
 * 
 * 核心策略:
 * 1. Topic-Aware: 根据传入的主题 ID 智能选择 RSS 源。
 * 2. Defensive Sampling: 防止源过多导致请求风暴，实行随机采样限制。
 * 3. Robustness: 强容错机制，单个源失败不影响整体。
 */
export class NewsFetcher {
    private parser: Parser;

    // 硬限制：每次聚合最多只请求 20 个源，防止超时
    private static MAX_SOURCES_PER_FETCH = 20;
    // 硬限制：RSS 请求超时时间 (毫秒)
    private static FETCH_TIMEOUT_MS = 5000;
    // 结果限制：最终返回给 LLM 的新闻条数
    private static MAX_ITEMS_TO_RETURN = 20;

    constructor() {
        this.parser = new Parser({
            timeout: NewsFetcher.FETCH_TIMEOUT_MS,
            headers: { 'User-Agent': 'ApertureDaily/1.0 (NewsAggregator)' }
        });
    }

    /**
     * 获取聚合新闻列表
     * @param topicIds - 关联的主题 ID 列表。如果为空，则尝试获取通用源。
     */
    async fetchAggregate(topicIds: string[] = []): Promise<NewsItem[]> {
        console.log(`[NewsFetcher] Starting aggregation for topics: [${topicIds.join(', ')}]`);

        // 1. 获取目标 RSS 源列表
        const sources = await this.getSourcesForTopics(topicIds);

        if (sources.length === 0) {
            console.warn('[NewsFetcher] No active sources found for these topics.');
            return [];
        }

        // 2. 防御性采样 (Defensive Sampling)
        // 如果源过多，随机打乱并截取前 N 个，保证性能恒定。
        const selectedSources = this.sampleSources(sources);
        console.log(`[NewsFetcher] Selected ${selectedSources.length} sources for fetching (pool size: ${sources.length}).`);

        // 3. 并发抓取 (Concurrent Fetching)
        // 使用 Promise.allSettled 确保部分失败不影响整体
        const fetchPromises = selectedSources.map(source => this.fetchSingleSource(source));
        const results = await Promise.allSettled(fetchPromises);

        // 4. 结果汇总与清洗
        let allItems: NewsItem[] = [];
        let successCount = 0;
        let failCount = 0;

        for (const res of results) {
            if (res.status === 'fulfilled') {
                allItems.push(...res.value);
                successCount++;
            } else {
                failCount++;
                // 仅在调试模式下打印详细错误，生产环境保持日志整洁
                // console.debug('[NewsFetcher] Source failed:', res.reason);
            }
        }

        console.log(`[NewsFetcher] Fetch complete. Success: ${successCount}, Failed: ${failCount}. Total items: ${allItems.length}`);

        // 5. 排序与截断 (Ranking & Truncation)
        // 按发布时间倒序排列，取最新的 N 条
        const sortedItems = allItems
            .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
            .slice(0, NewsFetcher.MAX_ITEMS_TO_RETURN);

        return sortedItems;
    }

    /**
     * 根据 Topic 获取源定义 (DB Layer)
     */
    private async getSourcesForTopics(topicIds: string[]) {
        if (topicIds.length === 0) {
            // 如果没有指定 Topic，策略：
            // 暂时策略：只返回那些有了 "General" 标记或者未绑定 Topic 的源
            // 但为了从简，当前若无 Topic 则只返回明确未绑定的源 (topic_id IS NULL)
            // 用户体验优化：如果没有 Topic，可能是在测试，或者通用文章
            return await db.selectFrom('news_sources')
                .select(['id', 'name', 'url'])
                .where('is_active', '=', 1)
                // .where(...) // 可以在此添加 "通用源" 逻辑
                .execute();
        }

        // 查询绑定了这些 Topic 的源
        // 使用 DISTINCT 防止同一源被多个 Topic 绑定时重复出现
        return await db.selectFrom('news_sources as ns')
            .innerJoin('topic_sources as ts', 'ts.source_id', 'ns.id')
            .select(['ns.id', 'ns.name', 'ns.url'])
            .where('ts.topic_id', 'in', topicIds)
            .where('ns.is_active', '=', 1)
            .groupBy('ns.id') // 去重
            .execute();
    }

    /**
     * 随机采样源 (Utils)
     */
    private sampleSources<T>(sources: T[]): T[] {
        if (sources.length <= NewsFetcher.MAX_SOURCES_PER_FETCH) {
            return sources;
        }
        // Shuffle (Fisher-Yates) - 简单随机打乱
        const shuffled = [...sources].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, NewsFetcher.MAX_SOURCES_PER_FETCH);
    }

    /**
     * 抓取单个 RSS 源 (Core Logic)
     */
    private async fetchSingleSource(source: { name: string; url: string }): Promise<NewsItem[]> {
        try {
            const feed = await this.parser.parseURL(source.url);

            // 简单的校验，确保有 items
            if (!feed.items || feed.items.length === 0) {
                return [];
            }

            // 提取并标准化数据
            // 只取每个源最新的 5 条，避免单个大源淹没其他源
            const items: NewsItem[] = feed.items.slice(0, 5).map(item => ({
                sourceName: source.name,
                title: item.title?.trim() || 'Untitled',
                link: item.link || '',
                summary: item.contentSnippet || item.summary || '', // 优先用纯文本摘要
                pubDate: item.pubDate || new Date().toISOString()
            })).filter(item => item.title && item.link); // 过滤无效数据

            // 过滤太久远的新闻 (比如超过 48 小时的)
            const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
            const recentItems = items.filter(item => {
                const pubTime = new Date(item.pubDate).getTime();
                return pubTime > twoDaysAgo;
            });

            // console.log(`[NewsFetcher] Parsed ${source.name} in ${Date.now() - start}ms. Found ${recentItems.length} recent items.`);
            return recentItems;

        } catch (error) {
            // console.warn(`[NewsFetcher] Failed to fetch ${source.name} (${source.url}): ${(error as Error).message}`);
            // 抛出错误以便 Promise.allSettled 捕获为 rejected
            throw error;
        }
    }
}
