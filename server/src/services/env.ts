/**
 * Centralized Environment Configuration
 * Usage: import { env } from '../services/env';
 */

export type LLMProviderType = 'gemini' | 'openai' | 'claude';

export const env = {
    // LLM Provider Selection
    get LLM_PROVIDER(): LLMProviderType | undefined {
        return process.env.LLM_PROVIDER?.toLowerCase() as LLMProviderType | undefined;
    },

    // --- Gemini Configuration ---
    get GEMINI_API_KEY() { return process.env.GEMINI_API_KEY; },
    get GEMINI_BASE_URL() { return process.env.GEMINI_BASE_URL; },
    get GEMINI_MODEL() { return process.env.GEMINI_MODEL; },

    // --- OpenAI Configuration ---
    get OPENAI_API_KEY() { return process.env.OPENAI_API_KEY; },
    get OPENAI_BASE_URL() { return process.env.OPENAI_BASE_URL; },
    get OPENAI_MODEL() { return process.env.OPENAI_MODEL; },

    // --- Claude Configuration ---
    get CLAUDE_API_KEY() { return process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY; },
    get CLAUDE_BASE_URL() { return process.env.CLAUDE_BASE_URL; },
    get CLAUDE_MODEL() { return process.env.CLAUDE_MODEL; },

    // --- Security & Admin ---
    get ADMIN_KEY() { return process.env.ADMIN_KEY; },

    // --- Integrations ---
    get SHANBAY_COOKIE() { return process.env.SHANBAY_COOKIE; },

    // --- Database (Cloudflare/Local) ---
    get CLOUDFLARE_ACCOUNT_ID() { return process.env.CLOUDFLARE_ACCOUNT_ID; },
    get CLOUDFLARE_DATABASE_ID() { return process.env.CLOUDFLARE_DATABASE_ID; },
    get CLOUDFLARE_API_TOKEN() { return process.env.CLOUDFLARE_API_TOKEN; },
    get CLOUDFLARE_DATABASE_NAME() { return process.env.CLOUDFLARE_DATABASE_NAME; },
};

export type ServiceEnv = typeof env;
