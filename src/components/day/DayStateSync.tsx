/**
 * DayStateSync - 状态同步器
 * 
 * 轻量级 React 组件，仅负责将 SSR 数据同步到全局状态
 * 不渲染任何 UI，作为不可见的孤岛运行
 */
import { useEffect } from 'react';
import { setArticles } from '../../lib/store/articlesStore';
import { initFromSSR } from '../../lib/store/adminStore';
import type { Article, AdminData } from '../../types';

interface Props {
    date: string;
    articles: Article[];
    adminData?: AdminData | null;
}

export default function DayStateSync({ date, articles, adminData }: Props) {
    useEffect(() => {
        // 同步文章数据到全局状态
        setArticles(date, articles);
        // 同步管理员数据
        initFromSSR(adminData || null);
    }, [date, articles, adminData]);

    // 不渲染任何 UI
    return null;
}
