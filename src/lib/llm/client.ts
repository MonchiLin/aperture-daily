import OpenAI from 'openai';

export type OpenAiCompatibleEnv = {
    LLM_API_KEY: string;
    LLM_BASE_URL: string;
};

// 35 minutes timeout for long-running LLM calls (e.g., o3-mini with xhigh reasoning + web_search)
const LLM_TIMEOUT_MS = 35 * 60 * 1000;

export function createOpenAiCompatibleClient(
    env: OpenAiCompatibleEnv,
    options?: { dangerouslyAllowBrowser?: boolean }
) {
    // LLM_BASE_URL 必须包含 /v1，代码不会自动补齐。
    if (!env.LLM_API_KEY) throw new Error('Missing LLM_API_KEY');
    if (!env.LLM_BASE_URL) throw new Error('Missing LLM_BASE_URL');
    return new OpenAI({
        apiKey: env.LLM_API_KEY,
        baseURL: env.LLM_BASE_URL,
        timeout: LLM_TIMEOUT_MS,
        ...(options?.dangerouslyAllowBrowser ? { dangerouslyAllowBrowser: true } : null)
    });
}
