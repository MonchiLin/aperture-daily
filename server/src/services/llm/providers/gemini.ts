/**
 * Gemini Provider - 原生 REST API 实现
 * 
 * 直接使用 fetch 调用 Gemini API，支持自定义代理
 * 兼容格式：https://domain/v1beta/models/MODEL:generateContent
 */

import type { LLMProvider, GenerateOptions, GenerateResponse } from '../types';

// 35 分钟超时
const GEMINI_TIMEOUT_MS = 35 * 60 * 1000;

export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high';

export type GeminiMessage = {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
};

export type GeminiRequest = {
    contents: GeminiMessage[];
    systemInstruction?: { parts: Array<{ text: string }> };
};

export type GeminiApiResponse = {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string; thought?: boolean }>;
            role?: string;
        };
        finishReason?: string;
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
    };
    error?: { code: number; message: string; status: string };
};

export class GeminiProvider implements LLMProvider {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(apiKey: string, model: string, baseUrl?: string) {
        if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
        if (!baseUrl) throw new Error('Missing GEMINI_BASE_URL');

        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async generate(options: GenerateOptions): Promise<GenerateResponse> {
        // 构建 URL: baseUrl/v1beta/models/MODEL:generateContent
        const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent`;

        console.log(`[Gemini] Calling: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        // 构建请求体
        const request: GeminiRequest = {
            contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
        };

        if (options.system) {
            request.systemInstruction = { parts: [{ text: options.system }] };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey,
                },
                body: JSON.stringify({
                    generationConfig: {
                        temperature: 1,
                        thinkingConfig: {
                            includeThoughts: true,
                            thinkingLevel: 'high'
                        }
                    },
                    ...request,
                    tools: [{ googleSearch: {} }]
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Gemini] HTTP ${response.status}:`, errorText);
                throw new Error(`Gemini API Error: ${response.status} - ${errorText.slice(0, 500)}`);
            }

            const data = await response.json() as GeminiApiResponse;

            if (data.error) {
                throw new Error(`Gemini API Error: ${data.error.code} - ${data.error.message}`);
            }

            // 提取文本（过滤掉 thought 部分）
            const text = this.extractText(data);

            return {
                text,
                output: data,
                usage: data.usageMetadata ? {
                    inputTokens: data.usageMetadata.promptTokenCount,
                    outputTokens: data.usageMetadata.candidatesTokenCount,
                    totalTokens: data.usageMetadata.totalTokenCount,
                } : undefined,
            };
        } catch (e) {
            clearTimeout(timeoutId);
            if (e instanceof Error && e.name === 'AbortError') {
                throw new Error(`Gemini Timeout: Request timed out after ${GEMINI_TIMEOUT_MS / 1000 / 60} minutes.`);
            }
            throw e;
        }
    }

    /**
     * 从 Gemini 响应中提取文本
     */
    private extractText(response: GeminiApiResponse): string {
        let text = '';

        if (response.candidates?.[0]?.content?.parts) {
            text = response.candidates[0].content.parts
                .filter(p => p.text && !p.thought)
                .map(p => p.text)
                .join('');
        }

        if (!text) {
            console.warn('[Gemini] Extracted text is empty. FULL RESPONSE:', JSON.stringify(response, null, 2));
        }

        return text;
    }
}

/**
 * 剥离 markdown 代码块包装
 * 处理 ```json ... ``` 或 ``` ... ``` 格式
 */
export function stripMarkdownCodeBlock(text: string): string {
    const trimmed = text.trim();

    // 匹配 ```json\n...\n``` 或 ```\n...\n```
    const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (match && match[1]) {
        return match[1].trim();
    }

    return trimmed;
}

/**
 * 从 Gemini 响应中提取思考过程
 */
export function extractGeminiThoughts(response: GeminiApiResponse): string | null {
    if (!response.candidates?.[0]?.content?.parts) return null;

    const parts = response.candidates[0].content.parts;
    const thoughtParts = parts.filter(p => p.thought && p.text);

    return thoughtParts.length > 0 ? thoughtParts.map(p => p.text).join('\n') : null;
}
