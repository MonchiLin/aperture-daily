/**
 * 测试 structure 注入 + 段落分割后的结果
 */
import { Database } from 'bun:sqlite';

// 手动实现简化版的 injector 逻辑来测试
const db = new Database('./local.db');
const v = db.query(`
    SELECT content, structure_json 
    FROM article_variants 
    WHERE article_id = ? AND level = 3
`).get('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any;

const content = v.content as string;
const structure = JSON.parse(v.structure_json) as any[];

console.log('=== 原始 Content ===');
console.log(content);

console.log('\n=== Content 中换行符位置 ===');
for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
        console.log(`位置 ${i}: 换行符前 "${content.substring(Math.max(0, i - 20), i)}" | 换行符后 "${content.substring(i + 1, i + 21)}"`);
    }
}

// 找 Mashable 句子的 structure
const mashStart = content.indexOf('Mashable');
const sentenceEnd = content.indexOf('products.') + 'products.'.length;

console.log('\n=== Mashable 句子范围 ===');
console.log(`start: ${mashStart}, end: ${sentenceEnd}`);

// 检查句子后面是否紧跟换行符
console.log('\n=== 句子结束后的字符 ===');
console.log(`位置 ${sentenceEnd}: "${content[sentenceEnd]}" (charCode: ${content.charCodeAt(sentenceEnd)})`);
console.log(`位置 ${sentenceEnd + 1}: "${content[sentenceEnd + 1]}" (charCode: ${content.charCodeAt(sentenceEnd + 1)})`);

// 检查 O (宾语) 的位置是否跨越换行符
const objStructure = structure.find((s: any) => s.role === 'o' && s.start >= mashStart && s.start < sentenceEnd);
console.log('\n=== 宾语 Structure ===');
console.log(`start: ${objStructure.start}, end: ${objStructure.end}`);

// 检查宾语范围内是否有换行符
let hasNewlineInObj = false;
for (let i = objStructure.start; i < objStructure.end; i++) {
    if (content[i] === '\n') {
        hasNewlineInObj = true;
        console.log(`❌ 宾语范围内有换行符在位置 ${i}`);
    }
}
if (!hasNewlineInObj) {
    console.log('✅ 宾语范围内没有换行符');
}

db.close();
