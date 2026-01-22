/**
 * ImpressionStyleController - 阅读风格重定向控制器
 *
 * 根据用户设置和文章的 generationMode 决定是否重定向到 Impression 页面。
 * 如果当前在默认页面但用户设置为 Impression 风格，则重定向到 /date/impression/slug。
 * 如果当前在 Impression 页面但用户设置为默认风格，则重定向回 /date/slug。
 */
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { settingsStore, type GenerationMode } from '../../lib/store/settingsStore';

interface ImpressionStyleControllerProps {
    /** 文章生成模式 */
    generationMode: GenerationMode;
    /** 当前页面是否是 Impression 页面 */
    isImpressionPage?: boolean;
}

export function ImpressionStyleController({
    generationMode,
    isImpressionPage = false,
}: ImpressionStyleControllerProps) {
    const settings = useStore(settingsStore);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        // 兼容旧版本设置
        const readingStyles = settings.readingStyles ?? {
            rss: 'default' as const,
            impression: 'impression' as const,
        };

        const userWantsImpression = readingStyles[generationMode] === 'impression';
        const currentPath = window.location.pathname;

        // 当前在默认页面，但用户想要 Impression
        if (!isImpressionPage && userWantsImpression) {
            // 构建 Impression 页面 URL: /date/impression/slug
            const parts = currentPath.split('/').filter(Boolean);
            if (parts.length >= 2) {
                const date = parts[0];
                const slugParts = parts.slice(1);
                const newPath = `/${date}/impression/${slugParts.join('/')}`;
                window.location.replace(newPath);
            }
        }

        // 当前在 Impression 页面，但用户想要默认风格
        if (isImpressionPage && !userWantsImpression) {
            // 构建默认页面 URL: /date/slug
            const parts = currentPath.split('/').filter(Boolean);
            // parts: ['date', 'impression', ...slug]
            if (parts.length >= 3 && parts[1] === 'impression') {
                const date = parts[0];
                const slugParts = parts.slice(2);
                const newPath = `/${date}/${slugParts.join('/')}`;
                window.location.replace(newPath);
            }
        }
    }, [mounted, settings, generationMode, isImpressionPage]);

    return null;
}
