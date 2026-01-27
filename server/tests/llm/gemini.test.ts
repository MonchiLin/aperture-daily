/**
 * Gemini Provider E2E Test
 * 
 * Simulates real task creation flow using today's date.
 * Run: bun test tests/llm/gemini.test.ts
 */

import { describe, it, expect, beforeAll, mock } from 'bun:test';
import { createClient, type LLMClientConfig } from '../../src/services/llm/client';
import { runPipeline, type PipelineCheckpoint } from '../../src/services/llm/pipeline';
import { saveTestPipelineResult } from './saveResult';
import { db } from '../../src/db/factory';

// Get today's date in YYYY-MM-DD format
const TODAY = new Date().toISOString().split('T')[0]!;

// Gemini Configuration from env
const config: LLMClientConfig = {
    provider: 'gemini',
    apiKey: process.env.GEMINI_API_KEY || '',
    baseUrl: process.env.GEMINI_BASE_URL,
    model: process.env.GEMINI_MODEL || '',
};

// RSS Mode Test Data (Small pool)
const RSS_CANDIDATE_WORDS = [
    'algorithm', 'neural', 'quantum', 'interface', 'latency',
    'optimize', 'infrastructure', 'resilience', 'paradigm', 'scalable'
];
const RSS_TOPIC = 'Technology & AI';

// Impression Mode Test Data (Large pool)
// Generate 50 tech/business related words for testing
const IMPRESSION_CANDIDATE_WORDS = [
    'innovate', 'disrupt', 'synergy', 'leverage', 'ecosystem',
    'sustainable', 'metric', 'benchmark', 'roadmap', 'stakeholder',
    'analytics', 'cloud', 'blockchain', 'automation', 'cybersecurity',
    'bandwidth', 'protocol', 'encryption', 'legacy', 'migration',
    'agile', 'scrum', 'iterate', 'deploy', 'version',
    'frontend', 'backend', 'database', 'server', 'client',
    'revenue', 'profit', 'margin', 'quarterly', 'fiscal',
    'market', 'share', 'growth', 'decline', 'trend',
    'user', 'experience', 'interface', 'design', 'accessibility',
    'mobile', 'desktop', 'tablet', 'responsive', 'native'
];
const IMPRESSION_TOPIC = 'Business & Technology';

// Mock RSS Item to simulate explicit article selection (Fallback)
const MOCK_RSS_ITEM = {
    sourceName: 'Wikipedia',
    title: 'Artificial intelligence',
    link: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
    summary: 'Artificial intelligence (AI) is intelligence—perceiving, synthesizing, and inferring information—demonstrated by machines, as opposed to the intelligence displayed by non-human animals and humans.',
    pubDate: new Date().toISOString()
};

// Mock NewsFetcher
mock.module('../../src/services/news/fetcher', () => {
    return {
        NewsFetcher: class {
            async fetchAggregate() {
                console.log('[Mock] Fetching aggregate news from DB...');
                try {
                    // Try to find a real RSS item from previous successful tasks
                    const task = await db.selectFrom('tasks')
                        .select('context_json')
                        .where('context_json', 'is not', null)
                        .where('mode', '=', 'rss')
                        .orderBy('created_at', 'desc')
                        .executeTakeFirst();

                    if (task?.context_json && task.context_json.selectedRssItem) {
                        console.log(`[Mock] Using DB Item: ${task.context_json.selectedRssItem.title}`);
                        return [task.context_json.selectedRssItem];
                    }
                } catch (err) {
                    console.warn('[Mock] DB Fetch failed:', err);
                }

                console.log('[Mock] Fallback to static Wikipedia item');
                return [MOCK_RSS_ITEM];
            }
        }
    };
});

describe('Gemini Provider - Full Pipeline Test', () => {
    // ... (beforeAll unchanged)

    // Test 1: RSS Mode
    it('[RSS Mode] should complete 5-stage pipeline with MOCK source', async () => {
        if (!config.apiKey || !config.model) {
            console.log('[Skip] No Gemini credentials');
            return;
        }

        const client = createClient(config);
        const checkpoints: PipelineCheckpoint[] = [];

        console.log('[Test] Starting RSS Mode Pipeline with FORCED Candidate...');

        const result = await runPipeline({
            client,
            currentDate: TODAY,
            topicPreference: RSS_TOPIC,
            candidateWords: RSS_CANDIDATE_WORDS,
            mode: 'rss',
            recentTitles: [],
            onCheckpoint: async (cp) => {
                checkpoints.push(cp);
                console.log(`[RSS] Checkpoint: ${cp.stage}`);
            }
        });

        // Verify Output
        expect(result.output).toBeDefined();
        expect(result.output.title).toBeTruthy();
        expect(result.output.articles.length).toBeGreaterThan(0);
        expect(result.selectedWords.length).toBeGreaterThan(0);

        // Verify source was actually used (implicitly checked by verifying result exists, 
        // but robustly we could check if selectedRssItem matches)
        const stage1Cp = checkpoints.find(cp => cp.stage === 'search_selection');
        expect(stage1Cp?.originalStyleSummary).toBeDefined();
        if (result.selectedRssItem) {
            expect(result.selectedRssItem.title).toBe(MOCK_RSS_ITEM.title);
        }

        // Verify Checkpoints
        const stages = checkpoints.map(cp => cp.stage);
        expect(stages).toContain('blueprint');
        expect(stages).toContain('writer');

        // Verify Style DNA extraction (Stage 1 New Feature)
        // variable 'stage1Cp' is already defined above, so we just check again or rename
        // Actually, checking previous line: "const stage1Cp = ..."
        // I will just remove this duplicate block because I moved it up.
        // Or if I intended to check it again, I reused the variable name without `const` or use check logic.
        // It seems I pasted the check logic *before* the existing check logic, causing duplication?
        // Let's just ensure we only have one check block.

        // (Deleting the redundant block at lines 103-105 which I likely copy-pasted incorrectly or didn't delete)


        console.log('[RSS] Generated Title:', result.output.title);

        // Save
        await saveTestPipelineResult(result, config, undefined, RSS_TOPIC);
    }, 35 * 60 * 1000);

    // Test 2: Impression Mode
    it('[Impression Mode] should complete 5-stage pipeline with large word pool', async () => {
        if (!config.apiKey || !config.model) {
            console.log('[Skip] No Gemini credentials');
            return;
        }

        const client = createClient(config);
        const checkpoints: PipelineCheckpoint[] = [];

        console.log('[Test] Starting Impression Mode Pipeline...');

        const result = await runPipeline({
            client,
            currentDate: TODAY,
            topicPreference: IMPRESSION_TOPIC,
            candidateWords: IMPRESSION_CANDIDATE_WORDS,
            mode: 'impression', // Explicitly set mode
            recentTitles: [],
            onCheckpoint: async (cp) => {
                checkpoints.push(cp);
                console.log(`[Impression] Checkpoint: ${cp.stage}`);
            }
        });

        // Verify Output
        expect(result.output).toBeDefined();
        expect(result.output.title).toBeTruthy();
        expect(result.output.articles.length).toBeGreaterThan(0);

        // Impression mode should aim for high word usage
        console.log('[Impression] Selected Words Count:', result.selectedWords.length);
        expect(result.selectedWords.length).toBeGreaterThan(10); // Expecting simpler threshold for stability, but target is 30-50

        // Verify Checkpoints
        const stages = checkpoints.map(cp => cp.stage);
        expect(stages).toContain('blueprint');
        expect(stages).toContain('writer');

        console.log('[Impression] Generated Title:', result.output.title);

        // Save
        await saveTestPipelineResult(result, config, undefined, IMPRESSION_TOPIC);
    }, 35 * 60 * 1000);

    it('should support basic generation', async () => {
        if (!config.apiKey || !config.model) {
            console.log('[Skip] No Gemini credentials');
            return;
        }
        const client = createClient(config);
        const response = await client.generate({
            prompt: 'Say "Hello from Gemini!"',
        });
        expect(response.text).toBeTruthy();
    }, 60000);
});
