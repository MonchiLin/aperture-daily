/**
 * Historical Echoes - Type Definitions
 * 
 * 复用 interactionStore.ts 中已有的类型，避免重复定义。
 */

// 从 interactionStore 导出的类型
export type { EchoData, WordDefinitionData } from '@/lib/store/interactionStore';

/**
 * 单条 Echo 数据 (展开后的数组元素)
 */
export interface EchoItem {
    snippet: string;
    articleTitle: string;
    articleId: string;
    articleSlug?: string;
    date: string;
    timeAgo: string;
}

/**
 * Popover 内容组件的 Props
 */
export interface PopoverContentProps {
    definition: import('@/lib/store/interactionStore').WordDefinitionData | null;
    echoes: EchoItem[];
    showDefinition: boolean;
}
