import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { PlusIcon, TrashIcon, UploadIcon } from '@radix-ui/react-icons';

interface NewsSource {
    id: string;
    name: string;
    url: string;
    is_active: boolean;
}

/**
 * GlobalRssPanel - 全局 RSS 源管理面板
 * 
 * 允许管理员查看、添加和删除全局 RSS 源池。
 * 这些源随后可以与特定的 Topic 进行绑定。
 */
export default function GlobalRssPanel() {
    const [sources, setSources] = useState<NewsSource[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchSources = async () => {
        try {
            const data = await apiFetch<NewsSource[]>('/api/rss');
            setSources(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSources();
    }, []);

    /**
     * 创建新的 RSS 源
     * 同时也执行简单的非空校验
     */
    const handleCreate = async () => {
        if (!newName || !newUrl) return;
        setIsSubmitting(true);
        try {
            await apiFetch('/api/rss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, url: newUrl })
            });
            setNewName('');
            setNewUrl('');
            fetchSources();
        } catch (e) {
            alert('Failed to create source. Check URL or duplicates.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this feed? This will unbind it from all topics.')) return;
        try {
            await apiFetch(`/api/rss/${id}`, { method: 'DELETE' });
            setSources(prev => prev.filter(s => s.id !== id));
        } catch (e) {
            alert('Failed to delete source');
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const content = ev.target?.result as string;
            if (!content) return;

            try {
                setLoading(true);
                const res = await apiFetch<{ success: boolean; totalFound: number; added: number }>('/api/rss/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ opml_content: content })
                });

                if (res.success) {
                    alert(`Import successful! Found ${res.totalFound} feeds, added ${res.added} new feeds.`);
                    fetchSources();
                } else {
                    alert('Import failed: ' + (res as any).message);
                }
            } catch (err) {
                console.error(err);
                alert('Import failed due to server error.');
            } finally {
                setLoading(false);
                // Reset file input
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleImportUrl = async () => {
        const url = prompt("Enter OPML URL (e.g. public export link):");
        if (!url) return;

        try {
            setLoading(true);
            const res = await apiFetch<{ success: boolean; totalFound: number; added: number }>('/api/rss/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (res.success) {
                alert(`Import successful! Found ${res.totalFound} feeds, added ${res.added} new feeds.`);
                fetchSources();
            } else {
                alert('Import failed: ' + (res as any).message);
            }
        } catch (err) {
            console.error(err);
            alert('Import failed due to server error.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold font-serif text-stone-800">RSS Feeds</h3>
                    <p className="text-sm text-stone-500">Manage the global pool of news sources.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleImportUrl}
                        className="px-3 py-1.5 bg-white border border-stone-200 text-stone-500 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
                    >
                        Import from URL
                    </button>
                    <div>
                        <input
                            type="file"
                            accept=".opml,.xml"
                            className="hidden"
                            id="opml-upload"
                            onChange={handleImport}
                        />
                        <label
                            htmlFor="opml-upload"
                            title="Supports OPML exports from Feedly, Inoreader, etc."
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-stone-50 hover:text-stone-900 cursor-pointer transition-colors shadow-sm"
                        >
                            <UploadIcon /> Import File
                        </label>
                    </div>
                </div>
            </div>

            {/* Create New Source */}
            <div className="p-4 bg-white border border-stone-200 rounded-sm shadow-sm space-y-3">
                <div className="text-xs font-bold uppercase text-stone-400 tracking-wider">Add New Feed</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        placeholder="Source Name (e.g. The Verge)"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        className="px-3 py-2 border border-stone-200 rounded-sm text-sm focus:outline-none focus:border-stone-400"
                    />
                    <input
                        placeholder="https://..."
                        value={newUrl}
                        onChange={e => setNewUrl(e.target.value)}
                        className="px-3 py-2 border border-stone-200 rounded-sm text-sm font-mono focus:outline-none focus:border-stone-400"
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        onClick={handleCreate}
                        disabled={!newName || !newUrl || isSubmitting}
                        className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-stone-50 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-stone-700 disabled:opacity-50 transition-colors"
                    >
                        <PlusIcon /> Add Source
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="border border-stone-200 rounded-sm overflow-hidden bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-medium uppercase tracking-wider text-[10px]">
                        <tr>
                            <th className="px-4 py-3">Source Name</th>
                            <th className="px-4 py-3">Feed URL</th>
                            <th className="px-4 py-3 w-16 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {loading ? (
                            <tr><td colSpan={3} className="p-6 text-center text-stone-400">Loading...</td></tr>
                        ) : sources.length === 0 ? (
                            <tr><td colSpan={3} className="p-6 text-center text-stone-400 italic">No sources found. Add one above or Import OPML.</td></tr>
                        ) : (
                            sources.map(source => (
                                <tr key={source.id} className="group hover:bg-stone-50/50">
                                    <td className="px-4 py-3 font-medium text-stone-800">
                                        {source.name}
                                    </td>
                                    <td className="px-4 py-3 text-stone-500 font-mono text-xs truncate max-w-xs" title={source.url}>
                                        {source.url}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => handleDelete(source.id)}
                                            className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded transition-colors"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
