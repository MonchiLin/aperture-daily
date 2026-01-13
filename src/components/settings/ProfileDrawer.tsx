
import { useState, useEffect } from 'react';
import { Drawer, ConfigProvider, Tabs } from 'antd';
import { apiFetch } from '../../lib/api';
import { clsx } from 'clsx';
import RssSourceManager from './RssSourceManager';

export type GenerationProfile = {
    id: string;
    name: string;
    topicIds?: string[];
    topics?: { id: string; label: string }[];
    createdAt: string;
    updatedAt: string;
};

export type ProfileDraft = {
    id: string | null;
    name: string;
    topicIds: string[];
};

interface Topic {
    id: string;
    label: string;
    is_active: boolean;
}

interface ProfileDrawerProps {
    open: boolean;
    mode: 'create' | 'edit';
    initialDraft: ProfileDraft;
    onClose: () => void;
    onSuccess: () => void;
}


export default function ProfileDrawer({ open, mode, initialDraft, onClose, onSuccess }: ProfileDrawerProps) {
    // ... state logic (kept same, removed expand states)
    const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);

    // Tab State
    const [activeTab, setActiveTab] = useState('1');

    // UI State for Accordion (only for Tab 2)
    const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

    // Initial draft sync
    useEffect(() => {
        if (open) {
            setDraft(initialDraft);
            setError(null);
            fetchTopics();
            setActiveTab('1');
            setExpandedTopicId(null);
        }
    }, [open, initialDraft]);

    const fetchTopics = async () => {
        try {
            const res = await apiFetch<Topic[]>('/api/topics');
            if (res) {
                setAvailableTopics(res.filter(t => t.is_active));
            }
        } catch (e) {
            console.error('Failed to fetch topics', e);
        }
    };

    const handleCreateTopic = async () => {
        const name = prompt("Enter new topic name:");
        if (!name) return;
        try {
            const res = await apiFetch<{ id: string }>('/api/topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: name, prompts: 'General news coverage' })
            });
            await fetchTopics();
            if (res.id) toggleTopic(res.id);
        } catch (e) {
            alert('Failed to create topic');
        }
    };

    const toggleTopic = (topicId: string) => {
        const current = new Set(draft.topicIds || []);
        if (current.has(topicId)) {
            current.delete(topicId);
        } else {
            current.add(topicId);
        }
        setDraft(d => ({ ...d, topicIds: Array.from(current) }));
    };

    async function handleSubmit() {
        setError(null);
        const name = draft.name.trim();

        if (!name) return setError('Name is required');
        if (draft.topicIds.length === 0) {
            return setError('Please select at least one topic');
        }

        const payload = { ...draft, name };

        setLoading(true);
        try {
            let savedProfileId = draft.id;
            if (mode === 'create') {
                const res = await apiFetch<{ id: string }>('/api/profiles', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                savedProfileId = res.id;
            } else if (draft.id) {
                await apiFetch(`/api/profiles/${encodeURIComponent(draft.id)}`, {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            // Update local state to reflect saved status (switching mode effectively)
            if (mode === 'create' && savedProfileId) {
                setDraft(d => ({ ...d, id: savedProfileId }));
                // Ideally prompt the parent to refresh the list, but we are keeping drawer open.
                // We might need to notify the parent to update the list without closing.
                // For now, just call onSuccess to likely trigger a refetch in parent.
            }
            onSuccess();
            // onClose(); // Removed as requested
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    const items = [
        {
            key: '1',
            label: 'Configuration',
            children: (
                <div className="space-y-6 pt-4">
                    <div className="space-y-1">
                        <label className="block text-xs font-bold uppercase tracking-widest text-stone-500">Profile Name</label>
                        <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 focus:border-stone-500 text-stone-900 text-sm focus:outline-none transition-colors"
                            placeholder="e.g. Morning Digest"
                            disabled={loading}
                        />
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center bg-stone-50 p-2 border border-stone-100 rounded-sm">
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-widest text-stone-600">Topics</h4>
                                <p className="text-[10px] text-stone-400">Select topics to include.</p>
                            </div>
                            <button
                                onClick={handleCreateTopic}
                                className="text-[10px] uppercase font-bold text-stone-500 hover:text-stone-900 flex items-center gap-1 bg-white px-2 py-1 border border-stone-200 shadow-sm rounded-sm hover:border-stone-300 transition-all"
                            >
                                <span className="text-lg leading-none">+</span> New Topic
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                            {availableTopics.length === 0 ? (
                                <div className="col-span-full text-stone-400 text-sm italic p-2 text-center">No active topics found.</div>
                            ) : (
                                availableTopics.map(topic => {
                                    const isSelected = draft.topicIds.includes(topic.id);
                                    return (
                                        <button
                                            key={topic.id}
                                            onClick={() => toggleTopic(topic.id)}
                                            className={clsx(
                                                "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide transition-all border rounded-sm flex items-center justify-between group",
                                                isSelected
                                                    ? "bg-stone-800 text-white border-stone-800 shadow-md transform scale-[1.02]"
                                                    : "bg-white text-stone-500 border-stone-200 hover:border-stone-400 hover:text-stone-700 hover:bg-stone-50"
                                            )}
                                        >
                                            <span className="truncate">{topic.label}</span>
                                            {isSelected && <span className="text-stone-400">✓</span>}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )
        },
        {
            key: '2',
            label: 'Data Sources (RSS)',
            disabled: !draft.id,
            children: (
                <div className="space-y-8 pt-4">
                    {!draft.id && <div className="p-4 bg-amber-50 text-amber-800 text-xs rounded border border-amber-100">Please save the profile first to configure sources.</div>}

                    {/* 1. Profile Level */}
                    {draft.id && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-stone-500 border-b border-stone-200 pb-2 flex items-center gap-2">
                                <span>Profile Direct Feeds</span>
                                <span className="px-1.5 py-0.5 bg-stone-100 text-[10px] rounded-full text-stone-400 font-normal">Global</span>
                            </h4>
                            <div className="bg-stone-50 border border-stone-200 rounded-sm p-3">
                                <RssSourceManager targetId={draft.id} targetType="profiles" />
                            </div>
                        </div>
                    )}

                    {/* 2. Topic Level */}
                    {draft.id && draft.topicIds.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-stone-500 border-b border-stone-200 pb-2 flex items-center gap-2">
                                <span>Topic Specific Feeds</span>
                                <span className="px-1.5 py-0.5 bg-stone-100 text-[10px] rounded-full text-stone-400 font-normal">Overrides</span>
                            </h4>

                            <div className="space-y-2">
                                {draft.topicIds.map(tid => {
                                    const topic = availableTopics.find(t => t.id === tid);
                                    if (!topic) return null;
                                    const isExpanded = expandedTopicId === tid;

                                    return (
                                        <div key={tid} className="border border-stone-200 rounded-sm overflow-hidden bg-white">
                                            <button
                                                onClick={() => setExpandedTopicId(isExpanded ? null : tid)}
                                                className={clsx(
                                                    "w-full flex items-center justify-between px-3 py-2 text-left text-xs font-bold uppercase tracking-wider transition-colors",
                                                    isExpanded ? "bg-stone-100 text-stone-900" : "bg-white text-stone-600 hover:bg-stone-50"
                                                )}
                                            >
                                                <span>{topic.label}</span>
                                                <span className="text-[10px] flex items-center gap-1">
                                                    {isExpanded ? 'Close' : 'Manage Sources'}
                                                    <span className={clsx("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>▼</span>
                                                </span>
                                            </button>

                                            {isExpanded && (
                                                <div className="p-3 bg-stone-50 border-t border-stone-200 animate-in slide-in-from-top-2 duration-200">
                                                    <RssSourceManager targetId={tid} targetType="topics" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )
        }
    ];

    return (
        <ConfigProvider
            theme={{
                token: {
                    fontFamily: 'inherit',
                    colorPrimary: '#1c1917', // stone-900
                    borderRadius: 2,
                },
                components: {
                    Tabs: {
                        itemColor: '#78716c', // stone-500
                        itemSelectedColor: '#1c1917', // stone-900
                        itemHoverColor: '#44403c', // stone-700
                        titleFontSize: 13,
                        inkBarColor: '#1c1917', // stone-900
                        itemActiveColor: '#1c1917',
                    },
                    Drawer: {
                        colorBgElevated: '#ffffff',
                    }
                }
            }}
        >
            <Drawer
                title={
                    <div className="flex items-center gap-2 text-stone-800">
                        <span className="font-serif italic text-lg">{mode === 'create' ? 'Create Profile' : 'Edit Profile'}</span>
                        {mode === 'edit' && draft.name && <span className="text-xs font-sans font-normal px-2 py-0.5 bg-stone-100 text-stone-500 rounded-full">{draft.name}</span>}
                    </div>
                }
                placement="right"
                onClose={onClose}
                open={open}
                width={800}
                classNames={{
                    header: 'border-b border-stone-100 px-6 py-4',
                    body: 'p-0',
                    footer: 'border-t border-stone-100 p-4 bg-stone-50/50'
                }}
                closeIcon={<span className="text-stone-400 hover:text-stone-900 transition-colors text-lg">×</span>}
            >
                <div className="h-full flex flex-col">
                    <div className="flex-1 overflow-y-auto">
                        {error && (
                            <div className="mb-6 text-sm text-red-600 bg-red-50 p-4 border border-red-100 rounded-sm flex items-center gap-2">
                                <span className="text-red-400">⚠</span> {error}
                            </div>
                        )}

                        <Tabs
                            activeKey={activeTab}
                            onChange={setActiveTab}
                            items={items}
                            className="font-sans profile-drawer-tabs"
                            size="large"
                            tabBarStyle={{ marginBottom: 24, borderBottom: '1px solid #e7e5e4' }}
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex-shrink-0 p-4 bg-white/80 backdrop-blur border-t border-stone-100 flex justify-end gap-3 z-10">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-stone-500 text-xs font-bold uppercase tracking-widest hover:text-stone-900 hover:bg-stone-50 rounded-sm transition-colors"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => void handleSubmit()}
                            disabled={loading}
                            className="px-6 py-2 bg-stone-900 text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-stone-800 disabled:opacity-50 shadow-sm transition-all transform active:scale-[0.98]"
                        >
                            {loading ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                </div>
            </Drawer>
        </ConfigProvider>
    );
}
