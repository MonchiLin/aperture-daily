import { useState } from 'react';
import { Info, Loader2, Copy, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';
import Modal from './ui/Modal';
import clsx from 'clsx';
import dayjs from 'dayjs';

interface ArticleInfoButtonProps {
    articleId: string;
}

export default function ArticleInfoButton({ articleId }: ArticleInfoButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ articles: any, tasks: any } | null>(null);

    const showModal = async () => {
        setIsModalOpen(true);
        if (!data) {
            setLoading(true);
            try {
                const res = await apiFetch<any>(`/api/articles/${articleId}`);
                setData(res);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
    };

    const { articles, tasks } = data || {};

    return (
        <>
            <button
                onClick={showModal}
                className="text-stone-300 hover:text-stone-600 transition-colors p-1 rounded-full hover:bg-stone-100"
                title="Debug Info"
            >
                <Info size={14} />
            </button>

            <Modal
                title="Article Metadata"
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                width={500}
            >
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="animate-spin text-stone-400" />
                    </div>
                ) : data ? (
                    <div className="space-y-8 font-sans text-stone-900 px-1">

                        {/* Article Section */}
                        <section>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3 flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-stone-400"></span>
                                Article Details
                            </h3>
                            <div className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
                                <Row>
                                    <Label>ID</Label>
                                    <ValueCopyable text={articles.id} />
                                </Row>
                                <Row>
                                    <Label>Model</Label>
                                    <div>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                                            {articles.model || 'Unknown'}
                                        </span>
                                    </div>
                                </Row>
                                <Row isLast>
                                    <Label>Created</Label>
                                    <div className="font-mono text-xs text-stone-500">
                                        {articles.created_at ? dayjs(articles.created_at).format('yyyy-MM-DD HH:mm:ss') : '-'}
                                    </div>
                                </Row>
                            </div>
                        </section>

                        {/* Task Section */}
                        {tasks && (
                            <section>
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3 flex items-center gap-2">
                                    <span className="w-1 h-1 rounded-full bg-stone-400"></span>
                                    Generation Task
                                </h3>
                                <div className="bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden">
                                    <Row>
                                        <Label>Task ID</Label>
                                        <ValueCopyable text={tasks.id} />
                                    </Row>
                                    <Row>
                                        <Label>Profile</Label>
                                        <div>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                {tasks.profileName || 'Default'}
                                            </span>
                                        </div>
                                    </Row>
                                    <Row>
                                        <Label>Status</Label>
                                        <div>
                                            <StatusBadge status={tasks.status} />
                                        </div>
                                    </Row>
                                    <Row>
                                        <Label>Source</Label>
                                        <div className="capitalize text-stone-600 font-serif text-sm">
                                            {tasks.trigger_source}
                                        </div>
                                    </Row>
                                    <Row isLast>
                                        <Label>Created</Label>
                                        <div className="font-mono text-xs text-stone-500">
                                            {tasks.created_at ? dayjs(tasks.created_at).format('yyyy-MM-DD HH:mm:ss') : '-'}
                                        </div>
                                    </Row>
                                </div>
                            </section>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-stone-400 italic">No data loaded</div>
                )}
            </Modal>
        </>
    );
}

function Row({ children, isLast }: { children: React.ReactNode, isLast?: boolean }) {
    return (
        <div className={clsx("flex items-center px-4 py-3 bg-white", !isLast && "border-b border-stone-100")}>
            {children}
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <div className="w-24 shrink-0 text-stone-400 font-bold text-[10px] uppercase tracking-wider">{children}</div>;
}

function ValueCopyable({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-center gap-2 group cursor-pointer min-w-0" onClick={handleCopy}>
            <span className="font-mono text-xs text-stone-600 truncate" title={text}>
                {text}
            </span>
            <button className="text-stone-300 hover:text-stone-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            </button>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles = {
        succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        failed: 'bg-red-50 text-red-700 border-red-200',
        processing: 'bg-orange-50 text-orange-700 border-orange-200',
        queued: 'bg-stone-50 text-stone-600 border-stone-200'
    };

    const style = styles[status as keyof typeof styles] || styles.queued;

    return (
        <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", style)}>
            {status}
        </span>
    );
}
