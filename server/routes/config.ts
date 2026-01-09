import { Elysia } from 'elysia';
import { env } from '../config/env';

/**
 * Expose LLM Configuration to Frontend
 */
export const configRoutes = new Elysia({ prefix: '/api/config' })
    .get('/llm', () => {
        // Helper to check if a provider is fully configured
        const isAvailable = (key?: string, model?: string, url?: string) => {
            return !!key && !!model && !!url;
        };

        const providers = {
            gemini: {
                available: isAvailable(env.GEMINI_API_KEY, env.GEMINI_MODEL, env.GEMINI_BASE_URL)
            },
            openai: {
                available: isAvailable(env.OPENAI_API_KEY, env.OPENAI_MODEL, env.OPENAI_BASE_URL)
            },
            claude: {
                available: isAvailable(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL, env.ANTHROPIC_BASE_URL)
            }
        };

        return {
            current_llm: env.LLM_PROVIDER,
            available_llms: Object.entries(providers)
                .filter(([_, config]) => config.available)
                .map(([key]) => key)
        };
    });
