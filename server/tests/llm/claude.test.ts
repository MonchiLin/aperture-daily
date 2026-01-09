/**
 * Claude Provider E2E Test
 * 
 * Simulates real task creation flow using today's date.
 * Run: bun test tests/llm/claude.test.ts
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { createClient, type LLMClientConfig } from '../../src/services/llm/client';
import { runPipeline, type PipelineCheckpoint } from '../../src/services/llm/pipeline';

// Get today's date in YYYY-MM-DD format
const TODAY = new Date().toISOString().split('T')[0]!;

// Claude Configuration from env
const config: LLMClientConfig = {
    provider: 'claude',
    apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
};

// Test data - simulating real candidate words
const TEST_CANDIDATE_WORDS = [
    'algorithm', 'neural', 'quantum', 'interface', 'latency',
    'optimize', 'infrastructure', 'resilience', 'paradigm', 'scalable'
];

const TEST_TOPIC_PREFERENCE = 'Technology & AI';

describe('Claude Provider - Full Pipeline Test', () => {
    beforeAll(() => {
        if (!config.apiKey) {
            console.warn('[Skip] CLAUDE_API_KEY or ANTHROPIC_API_KEY not set');
        }
        console.log(`[Claude Test] Date: ${TODAY}, Model: ${config.model}`);
    });

    it('should complete full 4-stage pipeline', async () => {
        if (!config.apiKey) {
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
        expect(result.selectedWords.length).toBeGreaterThan(0);

        // Verify checkpoints were saved
        expect(checkpoints.length).toBeGreaterThan(0);

        console.log('[Claude] Generated:', result.output.title);
        console.log('[Claude] Selected words:', result.selectedWords);
        console.log('[Claude] Article levels:', result.output.articles.length);
    }, 300000); // 5 minute timeout for full pipeline

    it('should support basic generation', async () => {
        if (!config.apiKey) {
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
