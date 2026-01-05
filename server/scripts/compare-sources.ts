/**
 * 比较 articles.content_json 和 article_variants.structure_json 的数据
 */
import { Database } from 'bun:sqlite';

const db = new Database('./local.db');

// 1. 从 articles 表获取 content_json
const article = db.query(`
    SELECT content_json FROM articles WHERE id = ?
`).get('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any;

console.log('=== articles.content_json 存在? ===', !!article?.content_json);

if (article?.content_json) {
    const parsed = JSON.parse(article.content_json);
    const level3 = parsed?.result?.articles?.find((a: any) => a.level === 3);

    console.log('\n=== 从 content_json 解析的 Level 3 ===');
    console.log('content 长度:', level3?.content?.length);
    console.log('structure 条目数:', level3?.structure?.length);

    if (level3?.structure) {
        // 找 lighting 相关
        const content = level3.content;
        const lightingIdx = content?.indexOf('lighting');
        console.log('\nlighting 位置:', lightingIdx);

        const nearby = level3.structure
            .filter((s: any) => s.start >= 400 && s.end <= 500)
            .sort((a: any, b: any) => a.start - b.start);

        console.log('\n=== "that promise..." 句子的 structure (来自 content_json) ===');
        nearby.forEach((s: any) => {
            console.log(`[${s.role.toUpperCase().padEnd(4)}] ${s.start}-${s.end}: "${content.substring(s.start, s.end)}"`);
        });
    }
}

// 2. 从 article_variants 表获取
const variant = db.query(`
    SELECT content, structure_json FROM article_variants WHERE article_id = ? AND level = 3
`).get('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any;

console.log('\n\n=== article_variants.structure_json ===');
if (variant?.structure_json) {
    const structure = JSON.parse(variant.structure_json);
    const content = variant.content;

    const nearby = structure
        .filter((s: any) => s.start >= 400 && s.end <= 500)
        .sort((a: any, b: any) => a.start - b.start);

    console.log('=== "that promise..." 句子的 structure (来自 article_variants) ===');
    nearby.forEach((s: any) => {
        console.log(`[${s.role.toUpperCase().padEnd(4)}] ${s.start}-${s.end}: "${content.substring(s.start, s.end)}"`);
    });
}

db.close();
