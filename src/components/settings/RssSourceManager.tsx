import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { PlusIcon, TrashIcon, Link2Icon } from '@radix-ui/react-icons';

interface NewsSource {
    id: string;
    name: string;
    url: string;
    is_active: boolean;
}

interface RssSourceManagerProps {
    targetId: string;
    targetType: 'topics' | 'profiles'; // Plural to match API prefix
}

/**
 * RssSourceManager - 通用 RSS 源管理器
 * 
 * 嵌入在 Topic 或 Profile 编辑界面中，负责管理绑定关系。
 */
export default function RssSourceManager({ targetId, targetType }: RssSourceManagerProps) {
    const [boundSources, setBoundSources] = useState<NewsSource[]>([]);
    const [allSources, setAllSources] = useState<NewsSource[]>([]);
    const [showAdd, setShowAdd] = useState(false);

    // Form for quick add
    const [newSourceUrl, setNewSourceUrl] = useState('');
    const [newSourceName, setNewSourceName] = useState('');

    const apiUrl = `/api/${targetType}/${targetId}/sources`;

    /**
     * 加载当前绑定的源以及全局所有可用源
     */
    const loadData = async () => {
        try {
            const [bound, all] = await Promise.all([
                apiFetch<NewsSource[]>(apiUrl),
                apiFetch<NewsSource[]>('/api/rss')
            ]);
            setBoundSources(bound || []);
            setAllSources(all || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (targetId) loadData();
    }, [targetId, targetType]);

    const handleBind = async (sourceId: string) => {
        try {
            await apiFetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId })
            });
            loadData();
            setShowAdd(false);
        } catch (e) {
            alert('Failed to bind source');
        }
    };

    const handleUnbind = async (sourceId: string) => {
        try {
            await apiFetch(`${apiUrl}/${sourceId}`, {
                method: 'DELETE'
            });
            loadData();
        } catch (e) {
            alert('Failed to unbind source');
        }
    };

    /**
     * 复合操作：创建新源 -> 立即绑定到当前 Topic
     * 简化用户操作路径，无需跳转到全局管理页
     */
    const handleCreateAndBind = async () => {
        if (!newSourceUrl || !newSourceName) return;
        try {
            // 1. Create Source
            const res = await apiFetch<{ id: string }>('/api/rss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newSourceName, url: newSourceUrl })
            });

            // 2. Bind
            if (res?.id) {
                await handleBind(res.id);
            }

            setNewSourceName('');
            setNewSourceUrl('');
        } catch (e) {
            alert('Failed to create source (URL might exist)');
        }
    };

    const unboundSources = allSources.filter(s => !boundSources.some(bs => bs.id === s.id));

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800">Linked RSS Feeds</h4>
                    <p className="text-[10px] text-stone-500">News from these sources will be prioritized for this topic.</p>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 font-bold rounded-sm transition-colors"
                >
                    <PlusIcon /> {showAdd ? 'Close Manager' : 'Add / Manage Feeds'}
                </button>
            </div>

            {/* List of Bound Sources */}
            <div className="space-y-2">
                {boundSources.length === 0 && !showAdd && (
                    <div className="p-4 bg-stone-50 border border-stone-100 rounded-sm text-center">
                        <p className="text-xs text-stone-400 italic">No feeds linked. This topic uses general search only.</p>
                    </div>
                )}

                <div className="grid gap-2">
                    {boundSources.map(source => (
                        <div key={source.id} className="flex items-center justify-between p-3 bg-white border border-stone-200 shadow-sm rounded-sm text-sm group hover:border-stone-300 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-1.5 bg-stone-50 rounded text-stone-400">
                                    <Link2Icon />
                                </div>
                                <div className="truncate">
                                    <div className="font-bold text-stone-700">{source.name}</div>
                                    <div className="text-xs text-stone-400 truncate font-mono">{source.url}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleUnbind(source.id)}
                                className="p-2 text-stone-300 hover:bg-red-50 hover:text-red-500 rounded transition-colors"
                                title="Unbind from current context"
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add Source UI - Expanded Area */}
            {showAdd && (
                <div className="mt-4 p-5 bg-stone-50 border border-stone-200 rounded-sm animate-in fade-in slide-in-from-top-2">
                    <h5 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-4 border-b border-stone-200 pb-2">Link News Source</h5>

                    <div className="space-y-6">
                        {/* Option A: Select Existing */}
                        {unboundSources.length > 0 && (
                            <div>
                                <label className="block text-xs font-bold text-stone-700 mb-2">Option A: Select from Global Sources</label>
                                <div className="flex gap-2">
                                    <select
                                        onChange={(e) => {
                                            if (e.target.value) handleBind(e.target.value);
                                        }}
                                        className="flex-grow p-2 border border-stone-300 rounded-sm text-sm bg-white focus:outline-none focus:border-stone-500"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>-- Choose a source to add --</option>
                                        {unboundSources.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.url})</option>
                                        ))}
                                    </select>
                                </div>
                                <p className="mt-1.5 text-[10px] text-stone-400">Selecting will immediately link the source.</p>
                            </div>
                        )}

                        {/* Divider */}
                        <div className="relative flex items-center">
                            <div className="flex-grow border-t border-stone-200"></div>
                            <span className="flex-shrink-0 mx-3 text-[10px] font-bold text-stone-300 uppercase">OR Create New</span>
                            <div className="flex-grow border-t border-stone-200"></div>
                        </div>

                        {/* Option B: Create New */}
                        <div>
                            <label className="block text-xs font-bold text-stone-700 mb-2">Option B: Create & Link New Source</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                <input
                                    placeholder="Source Name (e.g. TechCrunch)"
                                    value={newSourceName}
                                    onChange={e => setNewSourceName(e.target.value)}
                                    className="p-2 border border-stone-300 rounded-sm text-sm focus:outline-none focus:border-stone-500"
                                />
                                <input
                                    placeholder="RSS URL (https://...)"
                                    value={newSourceUrl}
                                    onChange={e => setNewSourceUrl(e.target.value)}
                                    className="p-2 border border-stone-300 rounded-sm text-sm font-mono focus:outline-none focus:border-stone-500"
                                />
                            </div>
                            <button
                                onClick={handleCreateAndBind}
                                disabled={!newSourceName || !newSourceUrl}
                                className="w-full py-2 bg-stone-800 text-white rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                <PlusIcon className="inline mr-1 mb-0.5" /> Create Source & Link to Topic
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
