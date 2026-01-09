/**
 * OpenAI Provider E2E Test
 * 
 * Simulates real task creation flow using today's date.
 * Run: bun test tests/llm/openai.test.ts
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { createClient, type LLMClientConfig } from '../../src/services/llm/client';
import { runPipeline, type PipelineCheckpoint } from '../../src/services/llm/pipeline';
import { saveTestPipelineResult } from './saveResult';

// Get today's date in YYYY-MM-DD format
const TODAY = new Date().toISOString().split('T')[0]!;

// OpenAI Configuration from env
const config: LLMClientConfig = {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL || '',
};

// Test data - simulating real candidate words
const TEST_CANDIDATE_WORDS = [
    'algorithm', 'neural', 'quantum', 'interface', 'latency',
    'optimize', 'infrastructure', 'resilience', 'paradigm', 'scalable'
];

const TEST_TOPIC_PREFERENCE = 'Technology & AI';

describe('OpenAI Provider - Full Pipeline Test', () => {
    beforeAll(() => {
        if (!config.apiKey || !config.model) {
            console.warn('[Skip] OPENAI_API_KEY or OPENAI_MODEL not set');
        }
        console.log(`[OpenAI Test] Date: ${TODAY}, Model: ${config.model}`);
    });

    it('should complete full 4-stage pipeline', async () => {
        if (!config.apiKey || !config.model) {
            console.log('[Skip] No OpenAI credentials');
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
                console.log(`[OpenAI] Checkpoint: ${cp.stage}`);
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

        console.log('[OpenAI] Generated:', result.output.title);
        console.log('[OpenAI] Selected words:', result.selectedWords);
        console.log('[OpenAI] Article levels:', result.output.articles.length);

        // Save to Database
        await saveTestPipelineResult(result, config);
    }, 3600000); // 60 minute timeout for full pipeline

    it('should support basic generation', async () => {
        if (!config.apiKey || !config.model) {
            console.log('[Skip] No OpenAI credentials');
            return;
        }

        const client = createClient(config);

        const response = await client.generate({
            prompt: 'Say "Hello from OpenAI!" and nothing else.',
        });

        expect(response.text).toBeTruthy();
        expect(response.text.toLowerCase()).toContain('hello');
        console.log('[OpenAI] Basic response:', response.text);
    }, 60000);
});
