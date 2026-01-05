/**
 * 检查特定句子的 structure 偏移量问题
 */
import { Database } from 'bun:sqlite';

const db = new Database('./local.db');
const variants = db.query('SELECT level, level_label, content, structure_json FROM article_variants WHERE article_id = ?').all('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any[];

for (const v of variants) {
    const content = v.content as string;
    const sentenceStart = content.indexOf('Mashable reporters');

    if (sentenceStart === -1) continue;

    const targetSentence = 'Mashable reporters were on site, documenting a broad spectrum of new gadgets and futuristic concept products.';

    console.log('\n=== Level', v.level, '(' + v.level_label + ') ===');
    console.log('句子在 content 中的起始位置:', sentenceStart);
    console.log('句子结束位置:', sentenceStart + targetSentence.length);
    console.log('\n完整 content (带位置标记):');

    // 显示 content 的每个字符位置
    for (let i = Math.max(0, sentenceStart); i < Math.min(content.length, sentenceStart + targetSentence.length + 10); i++) {
        if (i % 50 === 0 || i === sentenceStart) {
            console.log(`\n[${i}] `, content.substring(i, Math.min(i + 50, content.length)));
        }
    }

    // 解析 structure
    const structures = JSON.parse(v.structure_json) as any[];

    // 找到覆盖这个区域的 structure
    console.log('\n\n相关 structure 条目:');
    const relevantStructures = structures.filter(s =>
        s.start >= sentenceStart && s.end <= sentenceStart + targetSentence.length + 10
    ).sort((a, b) => a.start - b.start);

    relevantStructures.forEach(s => {
        const extractedText = content.substring(s.start, s.end);
        console.log(`\n  [${s.role.toUpperCase()}] start=${s.start}, end=${s.end}`);
        console.log(`    提取文本: "${extractedText}"`);
        if (s.extract && s.extract !== extractedText) {
            console.log(`    ⚠️ JSON中extract: "${s.extract}"`);
            console.log(`    ❌ 不匹配!`);
        }
    });

    // 特别检查宾语
    console.log('\n\n=== 宾语分析 ===');
    const expectedObject = 'a broad spectrum of new gadgets and futuristic concept products';
    const expectedStart = content.indexOf(expectedObject);
    const expectedEnd = expectedStart + expectedObject.length;
    console.log('期望宾语: "' + expectedObject + '"');
    console.log('期望位置: start=' + expectedStart + ', end=' + expectedEnd);

    const objStructure = relevantStructures.find(s => s.role === 'o');
    if (objStructure) {
        console.log('\n实际宾语 structure:');
        console.log('  start=' + objStructure.start + ', end=' + objStructure.end);
        console.log('  实际提取: "' + content.substring(objStructure.start, objStructure.end) + '"');

        if (objStructure.start !== expectedStart || objStructure.end !== expectedEnd) {
            console.log('\n❌ 偏移量不正确!');
            console.log('  start 偏差:', objStructure.start - expectedStart);
            console.log('  end 偏差:', objStructure.end - expectedEnd);
        }
    }
}

db.close();
