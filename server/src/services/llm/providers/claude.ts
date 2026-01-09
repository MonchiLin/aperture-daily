/**
 * Claude Provider (Stub)
 * 
 * Claude is currently disabled. This provider is a placeholder.
 */

import type { LLMProvider, GenerateOptions, GenerateResponse } from '../types';

export class ClaudeProvider implements LLMProvider {
    constructor(_apiKey: string, _model: string) {
        // constructor args ignored in stub
    }

    async generate(_options: GenerateOptions): Promise<GenerateResponse> {
        throw new Error('Claude provider is currently disabled.');
    }
}
