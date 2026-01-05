/**
 * WordsDrawer - 单词列表抽屉
 * 
 * 独立的单词列表入口，点击打开右侧抽屉显示当日单词。
 */
import { useState } from 'react';
import { Drawer, ConfigProvider } from 'antd';
import { BookOpen } from 'lucide-react';
import WordListPanel from './WordListPanel';

interface WordData {
    new_words: string[];
    review_words: string[];
    new_count: number;
    review_count: number;
}

export default function WordsDrawer({ date, wordData }: { date: string; wordData?: WordData }) {
    const [open, setOpen] = useState(false);

    const totalCount = wordData ? wordData.new_count + wordData.review_count : 0;

    return (
        <ConfigProvider
            theme={{
                token: {
                    fontFamily: 'inherit',
                }
            }}
        >
            <>
                <button
                    onClick={() => setOpen(true)}
                    className="flex items-center gap-1 text-[10px] font-bold tracking-[0.15em] uppercase text-amber-600 hover:text-amber-700 transition-colors cursor-pointer"
                >
                    <BookOpen size={12} />
                    WORDS
                    {totalCount > 0 && (
                        <span className="text-amber-600">({totalCount})</span>
                    )}
                </button>
                <Drawer
                    title={
                        <span className="font-serif italic text-stone-600">
                            单词列表 · {date}
                        </span>
                    }
                    placement="right"
                    onClose={() => setOpen(false)}
                    open={open}
                    size="large"
                    styles={{
                        header: { borderBottom: '1px solid #e7e5e4' },
                        body: { padding: '24px' }
                    }}
                >
                    {open && <WordListPanel date={date} initialData={wordData} />}
                </Drawer>
            </>
        </ConfigProvider>
    );
}
