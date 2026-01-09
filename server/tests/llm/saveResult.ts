/**
 * Test Utility - Save Pipeline Results to Database
 * 
 * Uses shared saveArticleResult function
 */

import { db } from '../../src/db/client';
import { tasks, generationProfiles } from '../../db/schema';
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
    await db.insert(generationProfiles).values({
        id: profileId,
        name: 'Test Profile',
        topicPreference: 'General',
        concurrency: 1,
        timeoutMs: 300000
    }).onConflictDoNothing();

    // 2. Insert Test Task
    await db.insert(tasks).values({
        id: taskId,
        taskDate: taskDate,
        type: 'article_generation',
        status: 'succeeded',
        profileId: profileId,
        resultJson: JSON.stringify(result.output),
        finishedAt: now,
        publishedAt: now
    });

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
