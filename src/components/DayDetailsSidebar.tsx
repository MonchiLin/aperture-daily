import { useEffect, useState } from 'react';
import { Drawer, Tabs, Tooltip, Popconfirm, message } from 'antd';
import { BookOpen, Trash2 } from 'lucide-react';
import AdminDayPanel from './AdminDayPanel';

type Article = {
    id: string;
    model: string;
    title: string;
};

type Task = {
    id: string;
    publishedAt: string | null;
};

type PublishedTaskGroup = {
    task: Task;
    articles: Article[];
};

type DayDetailsSidebarProps = {
    date: string | null;
    className?: string;
};

export default function DayDetailsSidebar({ date, className }: DayDetailsSidebarProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ publishedTaskGroups: PublishedTaskGroup[] }>({
        publishedTaskGroups: []
    });
    const [wordsOpen, setWordsOpen] = useState(false);
    const [wordsLoading, setWordsLoading] = useState(false);
    const [newWords, setNewWords] = useState<string[]>([]);
    const [reviewWords, setReviewWords] = useState<string[]>([]);

    useEffect(() => {
        if (!date) return;

        let canceled = false;
        setLoading(true);

        fetch(`/api/day/${date}`)
            .then(res => res.json())
            .then((json: any) => {
                if (canceled) return;
                if (json.error) {
                    console.error(json.error);
                    setData({ publishedTaskGroups: [] });
                } else {
                    setData(json);
                }
            })
            .catch(err => {
                console.error(err);
                if (!canceled) setData({ publishedTaskGroups: [] });
            })
            .finally(() => {
                if (!canceled) setLoading(false);
            });

        return () => {
            canceled = true;
        };
    }, [date]);

    useEffect(() => {
        setWordsOpen(false);
        setNewWords([]);
        setReviewWords([]);
    }, [date]);

    async function deleteArticle(articleId: string) {
        const adminKey = localStorage.getItem('luma-words_admin_key');
        if (!adminKey) {
            message.error('请先设置管理员密钥');
            return;
        }

        try {
            const resp = await fetch(`/api/admin/articles/${articleId}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Key': adminKey }
            });
            const json: { ok?: boolean; error?: string } = await resp.json();
            if (!resp.ok) {
                throw new Error(json.error || '删除失败');
            }
            message.success('文章已删除');
            // 更新本地状态，移除该文章
            setData(prev => ({
                ...prev,
                publishedTaskGroups: prev.publishedTaskGroups.map(group => ({
                    ...group,
                    articles: group.articles.filter(a => a.id !== articleId)
                })).filter(group => group.articles.length > 0)
            }));
        } catch (err) {
            message.error(err instanceof Error ? err.message : '删除失败');
        }
    }

    async function openWords() {
        if (!date) return;
        setWordsOpen(true);
        if (wordsLoading || newWords.length > 0 || reviewWords.length > 0) return;
        setWordsLoading(true);
        try {
            const resp = await fetch(`/api/day/${date}/words`);
            const json: any = await resp.json();
            if (!resp.ok) throw new Error(json?.error || 'Failed to load words');
            setNewWords(Array.isArray(json?.new_words) ? json.new_words : []);
            setReviewWords(Array.isArray(json?.review_words) ? json.review_words : []);
        } catch (err) {
            console.error(err);
            setNewWords([]);
            setReviewWords([]);
        } finally {
            setWordsLoading(false);
        }
    }

    if (!date) {
        return (
            <div className={`p-6 bg-white/60 backdrop-blur-xl border-l border-white/20 h-full overflow-y-auto ${className}`}>
                <div className="flex flex-col items-center justify-center h-full text-stone-300 gap-2">
                    <BookOpen size={24} className="opacity-50" />
                    <p className="font-serif italic">Select a date to start reading</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-full bg-white/60 backdrop-blur-xl border-l border-white/20 text-sm overflow-hidden transition-all duration-300 ${className}`}>
            <div className="p-6 pb-2 shrink-0">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-1">Select Date</span>
                        <h2 className="text-3xl font-bold tracking-tight text-stone-800 font-serif">
                            {date ? (
                                <span>
                                    {new Date(date).getDate()}
                                    <span className="text-lg text-stone-400 font-normal ml-2 font-sans">
                                        {new Date(date).toLocaleString('en-US', { month: 'short' })}
                                    </span>
                                </span>
                            ) : '—'}
                        </h2>
                    </div>

                    {date && (
                        <Tooltip title="今日单词" placement="bottom">
                            <button
                                onClick={openWords}
                                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-black/5 rounded-full transition-all"
                            >
                                <BookOpen size={20} strokeWidth={1.5} />
                            </button>
                        </Tooltip>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {loading ? (
                    <div className="animate-pulse space-y-4">
                        <div className="h-20 bg-stone-200 rounded-xl"></div>
                        <div className="h-32 bg-stone-200 rounded-xl"></div>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <AdminDayPanel date={date} />
                        </div>

                        {data.publishedTaskGroups.length > 0 ? (
                            <div className="space-y-6">
                                {data.publishedTaskGroups.map((group, groupIdx) => (
                                    <div
                                        key={group.task.id}
                                        className="relative animate-in fade-in slide-in-from-right-4 duration-700 fill-mode-backwards"
                                        style={{ animationDelay: `${groupIdx * 100}ms` }}
                                    >
                                        {/* 时间线装饰 (Optional) */}
                                        <div className="absolute left-0 top-0 bottom-0 w-px bg-stone-200/50 -ml-4 hidden"></div>



                                        <div className="grid gap-2">
                                            {group.articles.length === 0 ? (
                                                <div className="text-xs text-stone-400 italic pl-4">
                                                    Empty content
                                                </div>
                                            ) : (
                                                group.articles.map((a, idx) => (
                                                    <div
                                                        key={a.id}
                                                        className="group/card relative rounded-xl hover:bg-white/60 hover:shadow-sm border border-transparent hover:border-white/40 p-3 transition-all duration-300 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                                                    >
                                                        <a
                                                            href={`/article/${a.id}`}
                                                            className="block"
                                                        >
                                                            <div className="flex flex-col gap-1">

                                                                <h3 className="font-serif text-lg text-stone-800 leading-snug group-hover/card:text-black transition-colors">
                                                                    {a.title}
                                                                </h3>
                                                            </div>
                                                        </a>
                                                        <Popconfirm
                                                            title="删除文章"
                                                            description="Are you sure?"
                                                            onConfirm={(e) => {
                                                                e?.stopPropagation();
                                                                deleteArticle(a.id);
                                                            }}
                                                            okText="Delete"
                                                            cancelText="Cancel"
                                                            okButtonProps={{ danger: true, size: 'small' }}
                                                            cancelButtonProps={{ size: 'small' }}
                                                        >
                                                            <button
                                                                className="absolute top-3 right-3 p-1.5 rounded-full opacity-0 group-hover/card:opacity-100 hover:bg-red-50 text-stone-300 hover:text-red-500 transition-all scale-90 hover:scale-100"
                                                                onClick={(e) => e.preventDefault()}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </Popconfirm>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-stone-300 gap-3">
                                <div className="p-4 rounded-full bg-stone-100/50">
                                    <BookOpen size={24} className="opacity-50" />
                                </div>
                                <p className="text-sm font-medium tracking-wide">No reading for this day</p>
                            </div>
                        )}
                    </>
                )}
            </div>
            <Drawer
                title={
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Vocabulary</span>
                        <span className="font-serif text-xl font-bold text-stone-800">
                            {date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </span>
                    </div>
                }
                placement="right"
                width={400}
                onClose={() => setWordsOpen(false)}
                open={wordsOpen}
                styles={{
                    mask: {
                        backdropFilter: 'blur(4px)',
                        background: 'rgba(0, 0, 0, 0.2)'
                    },
                    header: {
                        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                        padding: '24px 24px 16px'
                    },
                    body: {
                        padding: '16px 24px'
                    },
                    wrapper: {
                        boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.08)'
                    }
                }}
                className="!bg-white/80 !backdrop-blur-2xl"
            >
                {wordsLoading ? (
                    <div className="py-20 flex flex-col items-center justify-center gap-3 text-stone-400">
                        <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-400 rounded-full animate-spin"></div>
                        <span className="text-xs uppercase tracking-wide">Loading Words...</span>
                    </div>
                ) : newWords.length + reviewWords.length === 0 ? (
                    <div className="py-20 text-center text-stone-400 flex flex-col items-center gap-3">
                        <div className="p-3 bg-stone-100 rounded-full">
                            <BookOpen size={20} className="opacity-40" />
                        </div>
                        <p className="text-sm">No vocabulary collected yet.</p>
                    </div>
                ) : (
                    <Tabs
                        defaultActiveKey="new"
                        items={[
                            {
                                key: 'new',
                                label: <span className="text-xs font-semibold uppercase tracking-wider">New Words <span className="ml-1 px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[10px]">{newWords.length}</span></span>,
                                children: (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {newWords.map((word) => (
                                            <span
                                                key={word}
                                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-stone-200 text-stone-700 shadow-sm hover:border-stone-300 hover:shadow transition-all cursor-default select-all"
                                            >
                                                {word}
                                            </span>
                                        ))}
                                    </div>
                                )
                            },
                            {
                                key: 'review',
                                label: <span className="text-xs font-semibold uppercase tracking-wider">Review <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[10px]">{reviewWords.length}</span></span>,
                                children: (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {reviewWords.map((word) => (
                                            <span
                                                key={word}
                                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-orange-50/50 border border-orange-100 text-orange-800 shadow-sm hover:border-orange-200 hover:shadow transition-all cursor-default select-all"
                                            >
                                                {word}
                                            </span>
                                        ))}
                                    </div>
                                )
                            }
                        ]}
                    />
                )}
            </Drawer>
        </div>
    );
}
