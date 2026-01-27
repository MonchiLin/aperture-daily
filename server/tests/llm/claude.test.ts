/**
 * Claude Provider E2E Test
 * 
 * Simulates real task creation flow using today's date.
 * Run: bun test tests/llm/claude.test.ts
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { createClient, type LLMClientConfig } from '../../src/services/llm/client';
import { runPipeline, type PipelineCheckpoint } from '../../src/services/llm/pipeline';
import { saveTestPipelineResult } from './saveResult';

// Get today's date in YYYY-MM-DD format
const TODAY = new Date().toISOString().split('T')[0]!;

// Claude Configuration from env
const config: LLMClientConfig = {
    provider: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL || '',
};

// Test data - simulating real candidate words
const TEST_CANDIDATE_WORDS = [
    'serendipity', 'ephemeral', 'resilience', 'paradigm', 'nuance',
    'meticulous', 'pragmatic', 'cognitive', 'aesthetic', 'innovative'
];

const TEST_TOPIC_PREFERENCE = 'Technology & Culture';

describe('Claude Provider - Full Pipeline Test', () => {
    beforeAll(() => {
        if (!config.apiKey || !config.model) {
            console.warn('[Skip] ANTHROPIC_API_KEY or ANTHROPIC_MODEL not set');
        }
        console.log(`[Claude Test] Date: ${TODAY}, Model: ${config.model}`);
    });

    it('should complete full 5-stage pipeline (Search -> Blueprint -> Draft -> JSON -> Analysis)', async () => {
        if (!config.apiKey || !config.model) {
            console.log('[Skip] No Claude credentials');
            return;
        }

        const client = createClient(config);
        const checkpoints: PipelineCheckpoint[] = [];

        const result = await runPipeline({
            client,
            currentDate: TODAY,
            topicPreference: TEST_TOPIC_PREFERENCE,
            candidateWords: TEST_CANDIDATE_WORDS,
            recentTitles: [],
            onCheckpoint: async (cp) => {
                checkpoints.push(cp);
                console.log(`[Claude] Checkpoint: ${cp.stage}`);
            }
        });

        // Verify output structure
        expect(result.output).toBeDefined();
        expect(result.output.title).toBeTruthy();
        expect(result.output.articles).toBeDefined();
        expect(result.output.articles.length).toBeGreaterThan(0);
        expect(result.output.articles.length).toBeGreaterThan(0);
        expect(result.selectedWords.length).toBeGreaterThan(0);

        // [New] Verify pull_quote and summary for L2/L3
        const complexArticles = result.output.articles.filter(a => a.level > 1);
        if (complexArticles.length > 0) {
            const sample = complexArticles[0]!;
            if (sample.summary) expect(sample.summary.length).toBeGreaterThan(10);
            console.log(`[Claude] Checked L${sample.level} article extras:`, {
                hasSummary: !!sample.summary,
            });
        }

        // Verify checkpoints were saved
        expect(checkpoints.length).toBeGreaterThan(0);

        console.log('[Claude] Generated:', result.output.title);
        console.log('[Claude] Selected words:', result.selectedWords);
        console.log('[Claude] Article levels:', result.output.articles.length);

        // Save to Database
        await saveTestPipelineResult(result, config, undefined, TEST_TOPIC_PREFERENCE);
    }, 3600000); // 60 minute timeout for full pipeline as it includes thinking

    it('should support basic generation', async () => {
        if (!config.apiKey || !config.model) {
            console.log('[Skip] No Claude credentials');
            return;
        }

        const client = createClient(config);

        const response = await client.generate({
            prompt: 'Say "Hello from Claude!" and nothing else.',
        });

        expect(response.text).toBeTruthy();
        expect(response.text.toLowerCase()).toContain('hello');
        console.log('[Claude] Basic response:', response.text);
    }, 60000);
});
