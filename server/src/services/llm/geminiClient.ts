/**
 * Gemini 客户端 - 原生 REST API 实现
 * 
 * 直接使用 fetch 调用 Gemini API，支持自定义代理
 * 兼容格式：https://domain/v1beta/models/MODEL:generateContent
 */

export type GeminiEnv = {
    GEMINI_API_KEY: string;
    GEMINI_BASE_URL: string;  // e.g. https://antigravity-project.zeabur.app
};

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

export type GeminiResponse = {
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

/**
 * 创建 Gemini 客户端
 */
export function createGeminiClient(env: GeminiEnv) {
    if (!env.GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    if (!env.GEMINI_BASE_URL) throw new Error('Missing GEMINI_BASE_URL');

    return {
        async generateContent(model: string, request: GeminiRequest): Promise<GeminiResponse> {
            // 构建 URL: baseUrl/v1beta/models/MODEL:generateContent
            const baseUrl = env.GEMINI_BASE_URL.replace(/\/$/, '');
            const url = `${baseUrl}/v1beta/models/${model}:generateContent`;

            console.log(`[Gemini] Calling: ${url}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': env.GEMINI_API_KEY,
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

                const data = await response.json() as GeminiResponse;

                if (data.error) {
                    throw new Error(`Gemini API Error: ${data.error.code} - ${data.error.message}`);
                }

                return data;
            } catch (e) {
                clearTimeout(timeoutId);
                if (e instanceof Error && e.name === 'AbortError') {
                    throw new Error(`Gemini Timeout: Request timed out after ${GEMINI_TIMEOUT_MS / 1000 / 60} minutes.`);
                }
                throw e;
            }
        }
    };
}

export type GeminiClient = ReturnType<typeof createGeminiClient>;

/**
 * 从 Gemini 响应中提取文本
 */
export function extractGeminiText(response: GeminiResponse): string {
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
export function extractGeminiThoughts(response: GeminiResponse): string | null {
    if (!response.candidates?.[0]?.content?.parts) return null;

    const parts = response.candidates[0].content.parts;
    const thoughtParts = parts.filter(p => p.thought && p.text);

    return thoughtParts.length > 0 ? thoughtParts.map(p => p.text).join('\n') : null;
}

/**
 * 安全调用 Gemini API（带计时日志）
 */
export async function safeGeminiCall<T>(
    operationName: string,
    call: () => Promise<T>
): Promise<T> {
    const callStartTime = Date.now();
    const callStartISO = new Date().toISOString();

    console.log(`[${operationName}] START at ${callStartISO}`);

    try {
        const result = await call();
        const elapsedMs = Date.now() - callStartTime;
        console.log(`[${operationName}] DONE in ${(elapsedMs / 1000).toFixed(1)}s`);
        return result;
    } catch (e) {
        const elapsedMs = Date.now() - callStartTime;
        const elapsedMinutes = (elapsedMs / 1000 / 60).toFixed(2);
        const message = e instanceof Error ? e.message : 'Unknown error';

        console.error(`[${operationName}] FAILED after ${elapsedMinutes} min (started: ${callStartISO}):`, message);

        throw new Error(`Gemini Error: ${operationName} failed after ${elapsedMinutes} min - ${message}`);
    }
}
