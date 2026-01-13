/**
 * 文章持久化模块 (saveArticle)
 *
 * 核心职责：将 LLM 生成的文章结果持久化到数据库
 *
 * 持久化流程：
 *   1. 创建主文章记录 (articles)
 *   2. 创建各难度级别变体 (article_variants)
 *   3. 保存词汇和释义 (article_vocabulary + article_vocab_definitions)
 *   4. 构建词汇索引用于高亮显示 (article_word_index)
 *
 * 设计说明：
 * - 一篇文章对应多个 variants（Easy/Medium/Hard 三档）
 * - 词汇表与释义分离，支持一词多义
 * - 词汇索引用于前端高亮和历史回顾功能
 */

import { toArticleSlug } from '../../../lib/slug';
import type { AppKysely } from '../../db/factory';
import type { PipelineResult } from '../llm/pipeline';
import { indexArticleWords } from '../wordIndexer';

export interface SaveArticleOptions {
    db: AppKysely;
    result: PipelineResult;
    taskId: string;
    taskDate: string;
    model: string;
    profileId?: string;
    topicPreference?: string;
    newWords?: string[];
    reviewWords?: string[];
}

export async function saveArticleResult(options: SaveArticleOptions): Promise<string> {
    const { db, result, taskId, taskDate, model } = options;
    const finishedAt = new Date().toISOString();
    const articleId = crypto.randomUUID();
    const sourceUrl = result.output.sources?.[0] || null;
    // 生成 URL 友好的 slug，用于前端路由
    const slug = toArticleSlug(result.output.title);

    // [Validation] Strict Topic Enforcement
    if (options.topicPreference) {
        const allowedTopics = options.topicPreference.split(/[,，]/).map(t => t.trim());
        if (!allowedTopics.includes(result.output.topic)) {
            throw new Error(`[StrictValidation] generated topic '${result.output.topic}' is not in allowed list [${allowedTopics.join(', ')}]`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // [1] 创建主文章记录
    // ─────────────────────────────────────────────────────────────
    await db.insertInto('articles').values({
        id: articleId,
        generation_task_id: taskId,
        model: model,
        variant: 1,  // 主记录固定为 variant=1
        title: result.output.title,
        slug: slug,
        source_url: sourceUrl,
        category: result.output.topic, // Persist category
        status: 'published',
        published_at: finishedAt
    }).execute();

    console.log(`[SaveArticle] Created article: ${result.output.title} (ID: ${articleId})`);

    // ─────────────────────────────────────────────────────────────
    // [2] 创建各难度级别变体
    //
    // 每个 variant 包含：
    // - level: 难度级别 (1=Easy, 2=Medium, 3=Hard)
    // - content: 该难度的文章正文
    // - syntax_json: 语法结构分析结果
    // - sentences_json: 句子拆分结果（用于逐句播放）
    // ─────────────────────────────────────────────────────────────
    if (result.output.articles) {
        for (const variant of result.output.articles) {
            const v = variant as any;

            await db.insertInto('article_variants').values({
                id: crypto.randomUUID(),
                article_id: articleId,
                level: v.level,
                level_label: v.level_name || `Level ${v.level}`,
                title: result.output.title,
                content: v.content,
                syntax_json: JSON.stringify(v.structure || []),
                sentences_json: JSON.stringify(v.sentences || [])
            }).execute();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // [3] 保存词汇和释义
    //
    // 处理冲突：同一篇文章可能多次出现相同词汇
    // 使用 onConflict.doNothing 避免重复插入
    // ─────────────────────────────────────────────────────────────
    if (result.output.word_definitions) {
        for (const wordDef of result.output.word_definitions) {
            const vocabId = crypto.randomUUID();
            await db.insertInto('article_vocabulary').values({
                id: vocabId,
                article_id: articleId,
                word: wordDef.word,
                used_form: wordDef.used_form,
                phonetic: wordDef.phonetic
            })
                .onConflict((oc) => oc.doNothing())
                .execute();

            // 查询实际插入的 ID（可能是已存在的记录）
            const vocabRow = await db.selectFrom('article_vocabulary')
                .select('id')
                .where('article_id', '=', articleId)
                .where('word', '=', wordDef.word)
                .executeTakeFirst();

            const targetVocabId = vocabRow?.id || vocabId;

            // 一词多义：每个词可能有多个释义
            if (wordDef.definitions) {
                for (const def of wordDef.definitions) {
                    await db.insertInto('article_vocab_definitions').values({
                        id: crypto.randomUUID(),
                        vocab_id: targetVocabId,
                        part_of_speech: def.pos,
                        definition: def.definition
                    }).execute();
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // [4] 构建词汇索引（用于高亮和历史回顾）
    //
    // 索引失败不阻断主流程，仅记录错误
    // ─────────────────────────────────────────────────────────────
    try {
        const contentDataForIndex = {
            schema: 'daily_news_v2',
            task_date: taskDate,
            topic_preference: options.topicPreference || '',
            input_words: {
                new: options.newWords || [],
                review: options.reviewWords || [],
                candidates: [],
                selected: result.selectedWords
            },
            word_usage_check: result.output.word_usage_check,
            result: result.output
        };
        await indexArticleWords(db, articleId, contentDataForIndex);
    } catch (e) {
        console.error(`[SaveArticle] Failed to index words:`, e);
    }

    console.log(`[SaveArticle] Completed saving article and related data.`);
    return articleId;
}

