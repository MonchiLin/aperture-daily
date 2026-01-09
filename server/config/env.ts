/**
 * 环境变量验证和导出
 */
export const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GEMINI_BASE_URL: process.env.GEMINI_BASE_URL || '',
    LLM_MODEL_DEFAULT: process.env.LLM_MODEL || '',
    ADMIN_KEY: process.env.ADMIN_KEY || '',
    SHANBAY_COOKIE: process.env.SHANBAY_COOKIE || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || '',
    LLM_PROVIDER: process.env.LLM_PROVIDER || 'gemini',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '',
    OPENAI_MODEL: process.env.OPENAI_MODEL || '',
    BUILD_TIME: process.env.BUILD_TIME || 'Dev'
};

// 验证关键环境变量
if (!env.GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is missing. Worker will fail.");
}
if (!env.ADMIN_KEY) {
    console.warn("WARNING: ADMIN_KEY is missing. Authentication will fail.");
}
if (!env.SHANBAY_COOKIE) {
    console.warn("WARNING: SHANBAY_COOKIE is missing. Word fetching will fail.");
}
