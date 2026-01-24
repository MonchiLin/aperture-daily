import { defineMiddleware } from "astro:middleware";
import type { UserPreferences } from "./types/auth";

export const onRequest = defineMiddleware(async (context, next) => {
    // 1. Admin Auth
    const adminKey = context.cookies.get("admin_key")?.value;
    const isAdmin = !!adminKey;

    // 2. Preferences
    let preferences: UserPreferences = {};
    const prefCookie = context.cookies.get("upword-preferences");
    if (prefCookie && prefCookie.value) {
        try {
            preferences = JSON.parse(decodeURIComponent(prefCookie.value));
        } catch (e) {
            // Silently fail on invalid JSON
        }
    }

    // 3. Inject Locals
    context.locals.auth = {
        isAdmin,
        preferences,
    };

    // 4. Cache Control Strategy
    // Default: Public caching for anon, Private for admin.
    // Pages can override this if needed, but this sets a safe baseline.
    const response = await next();

    // Only set header if not already set (allow pages to override)
    if (!response.headers.has("Cache-Control")) {
        // Default Strategy: Public SWR.
        // Server Islands handle private content, so the page shell is public.
        response.headers.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=86400");
    }

    return response;
});
