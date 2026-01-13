
import { useState, useEffect } from 'react';
import { Popconfirm, Drawer } from 'antd';
import { PlusIcon, TrashIcon, Pencil1Icon } from '@radix-ui/react-icons';
import { clsx } from 'clsx';
// import Modal from '../ui/Modal'; // Removed
import { apiFetch } from '../../lib/api';
import RssSourceManager from './RssSourceManager'; // [NEW]

interface Topic {
    id: string;
    label: string;
    prompts?: string;
    is_active: boolean;
}

export default function TopicsPanel() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        label: '',
        prompts: '',
        is_active: true
    });

    const fetchTopics = async () => {
        try {
            const data = await apiFetch<Topic[]>('/api/topics');
            if (data) {
                setTopics(data);
            }
        } catch (error) {
            console.error('Failed to fetch topics', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTopics();
    }, []);

    const handleEdit = (topic: Topic) => {
        setEditingTopic(topic);
        setFormData({
            label: topic.label,
            prompts: topic.prompts || '',
            is_active: topic.is_active
        });
        setIsCreating(false);
    };

    const handleCreate = () => {
        setEditingTopic(null);
        setFormData({
            label: '',
            prompts: '',
            is_active: true
        });
        setIsCreating(true);
    };

    const handleSave = async () => {
        const url = isCreating ? '/api/topics' : `/api/topics/${editingTopic?.id}`;
        const method = isCreating ? 'POST' : 'PUT';

        try {
            await apiFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            await fetchTopics();
            setIsCreating(false);
            setEditingTopic(null);
        } catch (error) {
            console.error('Save error', error);
            alert('Failed to save topic');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiFetch(`/api/topics/${id}`, { method: 'DELETE' });
            fetchTopics();
        } catch (error) {
            console.error('Delete error', error);
        }
    };

    if (loading) return <div className="p-8 text-center text-stone-500">Loading topics...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold font-serif text-stone-800">Topic Management</h3>
                    <p className="text-sm text-stone-500">Define topics and their search/writing prompts.</p>
                </div>
                <button
                    onClick={handleCreate}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-stone-50 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-stone-700 transition-colors"
                >
                    <PlusIcon /> Add Topic
                </button>
            </div>

            <div className="border border-stone-200 rounded-sm overflow-hidden bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-medium uppercase tracking-wider text-[10px]">
                        <tr>
                            <th className="px-4 py-3">Label</th>
                            <th className="px-4 py-3">Prompt Instruction</th>
                            <th className="px-4 py-3 w-20">Status</th>
                            <th className="px-4 py-3 w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {topics.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-stone-400 italic">No topics defined.</td>
                            </tr>
                        ) : (
                            topics.map(topic => (
                                <tr key={topic.id} className="group hover:bg-stone-50/50">
                                    <td className="px-4 py-3 font-medium text-stone-800">{topic.label}</td>
                                    <td className="px-4 py-3 text-stone-600 truncate max-w-xs" title={topic.prompts}>
                                        {topic.prompts || <span className="text-stone-300 italic">Default</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={clsx(
                                            "inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide",
                                            topic.is_active ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-400"
                                        )}>
                                            {topic.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(topic)}
                                                className="p-1 hover:bg-stone-200 rounded text-stone-500 hover:text-stone-900"
                                            >
                                                <Pencil1Icon />
                                            </button>
                                            <Popconfirm
                                                title="Delete this topic?"
                                                description="Are you sure? This action cannot be undone."
                                                onConfirm={() => handleDelete(topic.id)}
                                                okText="Yes"
                                                cancelText="No"
                                            >
                                                <button
                                                    className="p-1 hover:bg-red-100 rounded text-stone-400 hover:text-red-600"
                                                >
                                                    <TrashIcon />
                                                </button>
                                            </Popconfirm>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Edit/Create Drawer */}
            <Drawer
                title={<span className="font-serif font-bold text-lg text-stone-800">{isCreating ? 'Create New Topic' : `Edit Topic: ${editingTopic?.label}`}</span>}
                placement="right"
                onClose={() => { setIsCreating(false); setEditingTopic(null); }}
                open={isCreating || !!editingTopic}
                width={800}
                styles={{
                    header: { borderBottom: '1px solid #e7e5e4', padding: '20px 24px' },
                    body: { padding: '24px', backgroundColor: '#fafaf9' }
                }}
            >
                <div className="space-y-8">
                    {/* Basic Info Section */}
                    <div className="bg-white p-6 rounded-sm border border-stone-200 shadow-sm space-y-5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">Basic Configuration</h4>

                        <div>
                            <label className="block text-sm font-medium text-stone-700 mb-1.5">Label (Display Name)</label>
                            <input
                                type="text"
                                value={formData.label}
                                onChange={e => setFormData({ ...formData, label: e.target.value })}
                                className="w-full px-4 py-2.5 border border-stone-200 rounded-sm focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-200 font-sans transition-all"
                                placeholder="e.g., Tech News"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-stone-700 mb-1.5">
                                Prompt Custom Instruction
                                <span className="ml-2 text-xs font-normal text-stone-400">Passed to AI to customize search & writing</span>
                            </label>
                            <textarea
                                value={formData.prompts}
                                onChange={e => setFormData({ ...formData, prompts: e.target.value })}
                                className="w-full px-4 py-3 border border-stone-200 rounded-sm focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-200 font-mono text-xs h-32 leading-relaxed transition-all"
                                placeholder="e.g., Focus on AI and Chip market. Avoid consumer gadgets."
                            />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={formData.is_active}
                                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-800 cursor-pointer"
                            />
                            <label htmlFor="is_active" className="text-sm font-medium text-stone-700 cursor-pointer select-none">Active (Available for selection)</label>
                        </div>
                    </div>

                    {/* RSS Management Section (Only in Edit Mode) */}
                    {editingTopic && !isCreating ? (
                        <div className="bg-white p-6 rounded-sm border border-stone-200 shadow-sm">
                            <RssSourceManager targetId={editingTopic.id} targetType="topics" />
                        </div>
                    ) : (
                        isCreating && <div className="p-4 bg-stone-100 border border-stone-200 border-dashed rounded text-center text-xs text-stone-500">
                            Save this topic first to manage RSS feeds.
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="pt-6 border-t border-stone-200 flex justify-between items-center">
                        <button
                            onClick={() => { setIsCreating(false); setEditingTopic(null); }}
                            className="px-5 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!formData.label}
                            className="px-6 py-2.5 bg-stone-900 text-white text-sm font-bold uppercase tracking-wider rounded-sm hover:bg-stone-800 disabled:opacity-50 transition-all shadow-sm"
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </Drawer>
        </div>
    );
}
