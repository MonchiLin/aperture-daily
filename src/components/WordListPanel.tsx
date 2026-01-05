/**
 * WordListPanel - 单词列表面板
 * 
 * 在 Drawer 中展示当日的新学和复习单词。
 * 支持 SSR 预取数据，避免客户端额外请求。
 */
import { useEffect, useState } from 'react';
import { Tabs, Tag, Spin, Empty } from 'antd';
import { apiFetch } from '../lib/api';


interface WordData {
    new_words: string[];
    review_words: string[];
    new_count: number;
    review_count: number;
}

interface WordListPanelProps {
    date: string;
    initialData?: WordData;
}

export default function WordListPanel({ date, initialData }: WordListPanelProps) {
    const [loading, setLoading] = useState(!initialData);
    const [data, setData] = useState<WordData | null>(initialData || null);
    const [error, setError] = useState<string | null>(null);

    // Effect handles both initial load (if no data) and refresh events
    useEffect(() => {
        if (!data) setLoading(true); // Only show spinner if we have no data at all
        setError(null);

        let canceled = false;
        apiFetch<WordData>(`/api/day/${date}/words`)
            .then((res) => {
                if (!canceled) setData(res);
            })
            .catch((e) => {
                if (!canceled) setError(e.message);
            })
            .finally(() => {
                if (!canceled) setLoading(false);
            });

        return () => { canceled = true; };
    }, [date]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spin size="default" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-xs text-red-600 bg-red-50 p-3 rounded">
                加载失败: {error}
            </div>
        );
    }

    if (!data || (data.new_count === 0 && data.review_count === 0)) {
        return (
            <Empty
                description="暂无单词数据"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                className="py-8"
            />
        );
    }

    const renderWordList = (words: string[]) => {
        if (words.length === 0) {
            return <div className="text-stone-400 text-sm italic py-4">无</div>;
        }
        return (
            <div className="flex flex-wrap gap-2 py-2">
                {words.map((word, i) => (
                    <Tag
                        key={`${word}-${i}`}
                        className="!m-0 !px-2.5 !py-1 !text-sm !font-medium !bg-stone-100 !text-stone-700 !border-stone-200 hover:!bg-stone-200 transition-colors cursor-default"
                    >
                        {word}
                    </Tag>
                ))}
            </div>
        );
    };

    const items = [
        {
            key: 'new',
            label: (
                <span className="font-medium">
                    新学 <span className="text-orange-500 ml-1">({data.new_count ?? 0})</span>
                </span>
            ),
            children: renderWordList(data.new_words ?? [])
        },
        {
            key: 'review',
            label: (
                <span className="font-medium">
                    复习 <span className="text-blue-500 ml-1">({data.review_count ?? 0})</span>
                </span>
            ),
            children: renderWordList(data.review_words ?? [])
        }
    ];

    return (
        <div className="word-list-panel">
            <Tabs
                defaultActiveKey="new"
                items={items}
                size="small"
                className="word-tabs"
            />
            <style>{`
                .word-tabs .ant-tabs-nav {
                    margin-bottom: 12px !important;
                }
                .word-tabs .ant-tabs-tab {
                    padding: 8px 0 !important;
                }
            `}</style>
        </div>
    );
}
