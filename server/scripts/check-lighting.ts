/**
 * 检查 "lighting" 周围的 structure 数据
 */
import { Database } from 'bun:sqlite';

const db = new Database('./local.db');
const v = db.query(`
    SELECT content, structure_json 
    FROM article_variants 
    WHERE article_id = ? AND level = 3
`).get('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any;

const content = v.content as string;
const structure = JSON.parse(v.structure_json) as any[];

// 找 "lighting" 的位置
const lightingIndex = content.indexOf('lighting');
console.log('=== "lighting" 在 content 中的位置 ===');
console.log('位置:', lightingIndex);
console.log('上下文:', JSON.stringify(content.substring(lightingIndex - 30, lightingIndex + 50)));

// 找覆盖 "lighting" 的所有 structure
console.log('\n=== 覆盖 "lighting" 的 structure ===');
const coveringLighting = structure.filter((s: any) =>
    s.start <= lightingIndex && s.end >= lightingIndex + 8 // "lighting" 长度为8
);
coveringLighting.forEach((s: any) => {
    console.log(`[${s.role.toUpperCase().padEnd(4)}] ${s.start}-${s.end}: "${content.substring(s.start, s.end)}"`);
});

// 找这一整句话的所有 structure
const sentenceStart = content.indexOf('that promise');
const sentenceEnd = content.indexOf('visuals.') + 8;
console.log('\n=== "that promise vibrant lighting and stunning visuals" 的所有 structure ===');
console.log('句子范围:', sentenceStart, '-', sentenceEnd);

const sentenceStructures = structure
    .filter((s: any) => s.start >= sentenceStart - 5 && s.end <= sentenceEnd + 5)
    .sort((a: any, b: any) => a.start - b.start);

sentenceStructures.forEach((s: any) => {
    console.log(`[${s.role.toUpperCase().padEnd(4)}] ${s.start}-${s.end}: "${content.substring(s.start, s.end)}"`);
});

db.close();
