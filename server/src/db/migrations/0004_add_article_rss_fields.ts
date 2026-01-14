/**
 * Migration: Add RSS tracking fields to articles table
 * 
 * 新增字段：
 * - rss_source_id: 关联 news_sources.id (ON DELETE SET NULL)
 * - rss_link: RSS 文章原始链接（唯一索引用于去重）
 */

import { Kysely } from 'kysely';

export async function up(db: Kysely<any>) {
    // 添加 rss_source_id 字段，外键引用 news_sources
    await db.schema.alterTable('articles')
        .addColumn('rss_source_id', 'text', (col) =>
            col.references('news_sources.id').onDelete('set null')
        )
        .execute();

    // 添加 rss_link 字段
    await db.schema.alterTable('articles')
        .addColumn('rss_link', 'text')
        .execute();

    // 创建唯一索引用于去重（允许 NULL）
    await db.schema
        .createIndex('uq_articles_rss_link')
        .ifNotExists()
        .on('articles')
        .column('rss_link')
        .unique()
        .execute();
}

export async function down(db: Kysely<any>) {
    await db.schema.dropIndex('uq_articles_rss_link').ifExists().execute();
    // SQLite 不支持 DROP COLUMN，需要重建表
    // 这里仅删除索引，字段保留
}
