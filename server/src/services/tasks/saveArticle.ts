/**
 * Save Article - Shared logic for persisting pipeline results
 * 
 * Used by both TaskExecutor (production) and test utilities
 */

import { sql } from 'drizzle-orm';
import { articleVariants, articleVocabulary, articleVocabDefinitions, articles } from '../../../db/schema';
import { indexArticleWords } from '../wordIndexer';
import { toArticleSlug } from '../../../lib/slug';
import type { AppDatabase } from '../../db/client';
import type { PipelineResult } from '../llm/pipeline';

export interface SaveArticleOptions {
    db: AppDatabase;
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
    await db.insert(articles).values({
        id: articleId,
        generationTaskId: taskId,
        model: model,
        variant: 1,
        title: result.output.title,
        slug: slug,
        sourceUrl: sourceUrl,
        status: 'published',
        publishedAt: finishedAt
    });

    console.log(`[SaveArticle] Created article: ${result.output.title} (ID: ${articleId})`);

    // 2. Insert Article Variants (Level 1, 2, 3)
    if (result.output.articles) {
        for (const variant of result.output.articles) {
            const v = variant as typeof variant & { sentences?: any[] };
            await db.insert(articleVariants).values({
                id: crypto.randomUUID(),
                articleId: articleId,
                level: v.level,
                levelLabel: v.level_name || `Level ${v.level}`,
                title: result.output.title,
                content: v.content,
                syntaxJson: JSON.stringify(v.structure || []),
                sentencesJson: JSON.stringify(v.sentences || [])
            });
        }
    }

    // 3. Insert Vocabulary & Definitions
    if (result.output.word_definitions) {
        for (const wordDef of result.output.word_definitions) {
            const vocabId = crypto.randomUUID();
            await db.insert(articleVocabulary).values({
                id: vocabId,
                articleId: articleId,
                word: wordDef.word,
                usedForm: wordDef.used_form,
                phonetic: wordDef.phonetic
            }).onConflictDoNothing();

            // Fetch existing or use new ID
            const vocabRow = await db.select()
                .from(articleVocabulary)
                .where(sql`${articleVocabulary.articleId} = ${articleId} AND ${articleVocabulary.word} = ${wordDef.word}`)
                .limit(1);

            const targetVocabId = vocabRow[0]?.id || vocabId;

            if (wordDef.definitions) {
                for (const def of wordDef.definitions) {
                    await db.insert(articleVocabDefinitions).values({
                        id: crypto.randomUUID(),
                        vocabId: targetVocabId,
                        partOfSpeech: def.pos,
                        definition: def.definition
                    });
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
        await indexArticleWords(articleId, contentDataForIndex);
    } catch (e) {
        console.error(`[SaveArticle] Failed to index words:`, e);
    }

    console.log(`[SaveArticle] Completed saving article and related data.`);
    return articleId;
}
