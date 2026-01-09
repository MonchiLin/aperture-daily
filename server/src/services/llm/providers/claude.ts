/**
 * Claude Provider (Stub)
 * 
 * Claude is currently disabled. This provider is a placeholder.
 */


import type { DailyNewsProvider, GenerateOptions, GenerateResponse, Stage1Input, Stage1Output, Stage2Input, Stage2Output, Stage3Input, Stage3Output, Stage4Input, Stage4Output } from '../types';

export class ClaudeProvider implements DailyNewsProvider {
    constructor(_apiKey: string, _model: string) {
        // constructor args ignored in stub
    }

    async generate(_options: GenerateOptions): Promise<GenerateResponse> {
        throw new Error('Claude provider is currently disabled.');
    }

    async runStage1_SearchAndSelection(_input: Stage1Input): Promise<Stage1Output> {
        throw new Error('Claude provider Stage 1 Not Implemented');
    }
    async runStage2_DraftGeneration(_input: Stage2Input): Promise<Stage2Output> {
        throw new Error('Claude provider Stage 2 Not Implemented');
    }
    async runStage3_JsonConversion(_input: Stage3Input): Promise<Stage3Output> {
        throw new Error('Claude provider Stage 3 Not Implemented');
    }
    async runStage4_SentenceAnalysis(_input: Stage4Input): Promise<Stage4Output> {
        throw new Error('Claude provider Stage 4 Not Implemented');
    }
}

