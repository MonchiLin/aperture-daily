/**
 * Save Article - Shared logic for persisting pipeline results (Kysely Edition)
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
    const slug = toArticleSlug(result.output.title);

    // 1. Insert Article (main record)
    await db.insertInto('articles').values({
        id: articleId,
        generation_task_id: taskId,
        model: model,
        variant: 1,
        title: result.output.title,
        slug: slug,
        source_url: sourceUrl,
        status: 'published',
        published_at: finishedAt
    }).execute();

    console.log(`[SaveArticle] Created article: ${result.output.title} (ID: ${articleId})`);

    // 2. Insert Article Variants
    if (result.output.articles) {
        for (const variant of result.output.articles) {
            // Type cast if necessary as pipeline result structure might have extra props (like sentences) 
            // not strictly typed in the main interface or optional.
            const v = variant as any;

            await db.insertInto('article_variants').values({
                id: crypto.randomUUID(),
                article_id: articleId,
                level: v.level,
                level_label: v.level_name || `Level ${v.level}`,
                title: result.output.title,
                content: v.content,
                // Kysely Manual Serialize for Insert
                syntax_json: JSON.stringify(v.structure || []),
                sentences_json: JSON.stringify(v.sentences || [])
            }).execute();
        }
    }

    // 3. Insert Vocabulary & Definitions
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

            // Fetch existing or use new ID
            const vocabRow = await db.selectFrom('article_vocabulary')
                .select('id')
                .where('article_id', '=', articleId)
                .where('word', '=', wordDef.word)
                .executeTakeFirst();

            const targetVocabId = vocabRow?.id || vocabId;

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

    // 4. Index Words for Highlighting/Memory
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
        // Pass db instance
        await indexArticleWords(db, articleId, contentDataForIndex);
    } catch (e) {
        console.error(`[SaveArticle] Failed to index words:`, e);
    }

    console.log(`[SaveArticle] Completed saving article and related data.`);
    return articleId;
}
