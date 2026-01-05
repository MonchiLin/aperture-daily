/**
 * 全面检查指定文章的数据完整性
 * 使用方式: bun run scripts/inspect-article.ts <article-id>
 */
import { Database } from 'bun:sqlite';

const articleId = process.argv[2] || '2d3e72c5-6a50-4375-95e5-a43fb8c4a69f';
const db = new Database('./local.db');

console.log(`\n========== 检查文章: ${articleId} ==========\n`);

// 1. 检查 articles 表
console.log('=== 1. articles 表 (主表) ===');
const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(articleId) as any;
if (!article) {
    console.log('❌ 文章不存在于 articles 表中!');
    db.close();
    process.exit(1);
}
console.log('✅ 文章存在');
console.log(JSON.stringify(article, null, 2));

// 2. 检查关联的 task
console.log('\n=== 2. tasks 表 (关联任务) ===');
const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(article.generation_task_id) as any;
if (!task) {
    console.log('❌ 关联的 task 不存在!');
} else {
    console.log('✅ Task 存在');
    console.log(JSON.stringify({
        id: task.id,
        task_date: task.task_date,
        type: task.type,
        status: task.status,
        created_at: task.created_at,
        started_at: task.started_at,
        finished_at: task.finished_at,
        published_at: task.published_at,
        result_json_length: task.result_json?.length,
        error_message: task.error_message
    }, null, 2));
}

// 3. 检查 article_variants 表
console.log('\n=== 3. article_variants 表 (难度分级内容) ===');
const variants = db.prepare('SELECT * FROM article_variants WHERE article_id = ? ORDER BY level').all(articleId) as any[];
if (variants.length === 0) {
    console.log('❌ 没有 article_variants 数据!');
} else {
    console.log(`✅ 找到 ${variants.length} 个 variants`);
    variants.forEach((v: any) => {
        console.log(`\n  Level ${v.level} (${v.level_label}):`);
        console.log(`    - ID: ${v.id}`);
        console.log(`    - Title: ${v.title}`);
        console.log(`    - Content 长度: ${v.content?.length || 0} 字符`);
        console.log(`    - Structure JSON: ${v.structure_json ? '有' : '❌ 无'}`);
        if (v.structure_json) {
            try {
                const structure = JSON.parse(v.structure_json);
                console.log(`    - Structure 条目数: ${Array.isArray(structure) ? structure.length : 'N/A'}`);
            } catch (e: any) {
                console.log(`    - ❌ Structure JSON 解析失败: ${e.message}`);
            }
        }
    });
}

// 4. 检查 article_vocabulary 表
console.log('\n=== 4. article_vocabulary 表 (词汇) ===');
const vocabulary = db.prepare('SELECT * FROM article_vocabulary WHERE article_id = ?').all(articleId) as any[];
if (vocabulary.length === 0) {
    console.log('⚠️ 没有 article_vocabulary 数据');
} else {
    console.log(`✅ 找到 ${vocabulary.length} 个词汇`);
    vocabulary.slice(0, 5).forEach((v: any) => {
        console.log(`  - ${v.word} [${v.phonetic || 'no phonetic'}]`);
    });
    if (vocabulary.length > 5) {
        console.log(`  ... 还有 ${vocabulary.length - 5} 个词汇`);
    }
}

// 5. 检查 article_vocab_definitions 表
console.log('\n=== 5. article_vocab_definitions 表 (词汇释义) ===');
const definitions = db.prepare(`
    SELECT d.*, v.word 
    FROM article_vocab_definitions d 
    JOIN article_vocabulary v ON d.vocab_id = v.id 
    WHERE v.article_id = ?
`).all(articleId) as any[];
if (definitions.length === 0) {
    console.log('⚠️ 没有 article_vocab_definitions 数据');
} else {
    console.log(`✅ 找到 ${definitions.length} 个释义`);
    definitions.slice(0, 5).forEach((d: any) => {
        console.log(`  - ${d.word} (${d.part_of_speech}): ${d.definition}`);
    });
    if (definitions.length > 5) {
        console.log(`  ... 还有 ${definitions.length - 5} 个释义`);
    }
}

// 6. 检查 article_word_index 表
console.log('\n=== 6. article_word_index 表 (单词索引) ===');
const wordIndex = db.prepare('SELECT * FROM article_word_index WHERE article_id = ?').all(articleId) as any[];
if (wordIndex.length === 0) {
    console.log('⚠️ 没有 article_word_index 数据');
} else {
    console.log(`✅ 找到 ${wordIndex.length} 条索引`);
    wordIndex.slice(0, 5).forEach((w: any) => {
        console.log(`  - ${w.word} [${w.role}]: "${w.context_snippet?.substring(0, 50)}..."`);
    });
    if (wordIndex.length > 5) {
        console.log(`  ... 还有 ${wordIndex.length - 5} 条索引`);
    }
}

// 7. 检查 highlights 表
console.log('\n=== 7. highlights 表 (高亮标注) ===');
const highlights = db.prepare('SELECT * FROM highlights WHERE article_id = ?').all(articleId) as any[];
console.log(`找到 ${highlights.length} 条高亮`);

// 8. 汇总
console.log('\n========== 数据完整性汇总 ==========');
const issues: string[] = [];
if (!article) issues.push('文章主记录不存在');
if (!task) issues.push('关联任务不存在');
if (variants.length === 0) issues.push('缺少 article_variants 数据');
if (variants.length > 0 && variants.some((v: any) => !v.structure_json)) {
    issues.push('部分 variant 缺少 structure_json');
}
if (vocabulary.length === 0) issues.push('缺少 article_vocabulary 数据');

if (issues.length === 0) {
    console.log('✅ 数据看起来完整');
} else {
    console.log('❌ 发现以下问题:');
    issues.forEach(issue => console.log(`  - ${issue}`));
}

db.close();
