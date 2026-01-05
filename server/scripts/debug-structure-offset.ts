/**
 * 调试 structure 偏移量问题
 * 检查 content 格式和 structure_json 偏移量是否匹配
 */
import { Database } from 'bun:sqlite';

const db = new Database('./local.db');
const v = db.query(`
    SELECT content, structure_json 
    FROM article_variants 
    WHERE article_id = ? AND level = 3
`).get('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any;

const content = v.content as string;
const structures = JSON.parse(v.structure_json) as any[];

console.log('=== Level 3 Content ===');
console.log(content);
console.log('\n=== Content 长度 ===', content.length);

// 检查是否包含 Markdown 标记
console.log('\n=== 检查 Markdown 标记 ===');
console.log('包含 ## :', content.includes('## '));
console.log('包含 ** :', content.includes('**'));
console.log('包含 [ :', content.includes('['));
console.log('包含 \\n\\n:', content.includes('\n\n'));

// 找到目标句子
const targetSentence = 'Mashable reporters were on site, documenting a broad spectrum of new gadgets and futuristic concept products.';
const sentenceStart = content.indexOf('Mashable reporters');
console.log('\n=== 目标句子 ===');
console.log('句子起始位置:', sentenceStart);
console.log('句子:', content.substring(sentenceStart, sentenceStart + targetSentence.length));

// 检查宾语的偏移量
const objStructure = structures.find((s: any) => s.role === 'o' && s.start >= sentenceStart && s.start < sentenceStart + targetSentence.length);
console.log('\n=== 宾语 Structure ===');
console.log('Structure:', JSON.stringify(objStructure, null, 2));
console.log('实际提取:', JSON.stringify(content.substring(objStructure.start, objStructure.end)));

// 检查 PP 结构（可能有嵌套问题）
const ppStructure = structures.find((s: any) => s.role === 'pp' && s.start >= sentenceStart && s.start < sentenceStart + targetSentence.length);
console.log('\n=== PP Structure ===');
console.log('Structure:', JSON.stringify(ppStructure, null, 2));
if (ppStructure) {
    console.log('实际提取:', JSON.stringify(content.substring(ppStructure.start, ppStructure.end)));
}

// 检查是否有嵌套/重叠问题
console.log('\n=== 该句子所有 Structure 排序 ===');
const sentenceStructures = structures
    .filter((s: any) => s.start >= sentenceStart && s.end <= sentenceStart + targetSentence.length + 5)
    .sort((a: any, b: any) => a.start - b.start);

sentenceStructures.forEach((s: any) => {
    const text = content.substring(s.start, s.end);
    console.log(`[${s.role.toUpperCase().padEnd(4)}] ${s.start}-${s.end}: "${text}"`);
});

db.close();
