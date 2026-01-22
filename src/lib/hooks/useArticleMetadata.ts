import { useEffect } from 'react';
import { apiFetch } from '../api';

/**
 * Hook: Log Article Metadata for Debugging
 * 
 * Silently fetches and logs article metadata to the console.
 * Replaces the old ArticleInfoButton UI component.
 */
export function useArticleMetadata(articleId?: string) {
    useEffect(() => {
        if (!articleId) return;

        const logDebugInfo = async () => {
            try {
                // Reduced noise: only group logs
                const res = await apiFetch<any>(`/api/articles/${articleId}`);

                console.groupCollapsed(`[Debug] Article Metadata (${articleId})`);
                console.log("Response:", res);

                if (res?.tasks) {
                    console.log("Generation Task:", res.tasks);
                }
                if (res?.articles) {
                    console.log("Article Row:", res.articles);
                }
                console.groupEnd();
            } catch (e) {
                console.error("[Debug] Failed to fetch article metadata", e);
            }
        };

        logDebugInfo();
    }, [articleId]);
}
