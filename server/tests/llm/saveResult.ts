/**
 * Test Utility - Save Pipeline Results to Database (Kysely Edition)
 */

import { db } from '../../src/db/factory';
import { saveArticleResult } from '../../src/services/tasks/saveArticle';
import type { PipelineResult } from '../../src/services/llm/pipeline';
import type { LLMClientConfig } from '../../src/services/llm/client';

export async function saveTestPipelineResult(
    result: PipelineResult,
    clientConfig: LLMClientConfig,
    forcedDate?: string
) {
    console.log('[Test] Saving pipeline result...');

    const now = new Date().toISOString();
    const taskId = `test-task-${crypto.randomUUID()}`;
    const profileId = 'test-profile-default';
    const taskDate = forcedDate || now.split('T')[0]!;

    // 1. Ensure Dummy Profile exists
    await db.insertInto('generation_profiles').values({
        id: profileId,
        name: 'Test Profile',
        topic_preference: 'General',
        concurrency: 1,
        timeout_ms: 300000
    })
        .onConflict((oc) => oc.doNothing())
        .execute();

    // 2. Insert Test Task
    await db.insertInto('tasks').values({
        id: taskId,
        task_date: taskDate,
        type: 'article_generation',
        status: 'succeeded',
        profile_id: profileId,
        llm: 'openai', // Default or from clientConfig.provider if mapped
        result_json: JSON.stringify(result.output),
        finished_at: now,
        published_at: now
    }).execute();

    // 3. Use shared save function for article data
    const articleId = await saveArticleResult({
        db,
        result,
        taskId,
        taskDate,
        model: clientConfig.model,
        profileId,
        topicPreference: 'General'
    });

    console.log(`[Test] Result saved. Article ID: ${articleId}`);
    return articleId;
}
