import { useState, useEffect } from 'react';
import { Popconfirm, Popover } from 'antd';
import { PlusIcon, TrashIcon, Pencil1Icon } from '@radix-ui/react-icons';
import { clsx } from 'clsx';
import { apiFetch } from '../../lib/api';
import { Tag } from '../ui/Tag';
import { getStringColor } from '../../lib/ui-utils';
import TopicFormDrawer from './topics/TopicFormDrawer';

interface Topic {
    id: string;
    label: string;
    prompts?: string;
    is_active: boolean;
    sources?: { id: string; name: string }[];
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
            const res = await apiFetch<{ success: boolean; id?: string }>(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            await fetchTopics();

            // 创建成功后自动切换到编辑模式（显示 RSS 管理器）
            if (isCreating && res.id) {
                setIsCreating(false);
                setEditingTopic({ id: res.id, label: formData.label, prompts: formData.prompts, is_active: formData.is_active });
            } else {
                setIsCreating(false);
                setEditingTopic(null);
            }
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
                            <th className="px-4 py-3 w-20 text-center">RSS</th>
                            <th className="px-4 py-3 w-20">Status</th>
                            <th className="px-4 py-3 w-24 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {topics.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-stone-400 italic">No topics defined.</td>
                            </tr>
                        ) : (
                            topics.map(topic => (
                                <tr key={topic.id} className="group hover:bg-stone-50/50">
                                    <td className="px-4 py-3 font-medium text-stone-800">{topic.label}</td>
                                    <td className="px-4 py-3 text-stone-600 truncate max-w-xs" title={topic.prompts}>
                                        {topic.prompts || <span className="text-stone-300 italic">Default</span>}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {(topic.sources || []).length === 0 ? (
                                            <span className="text-stone-300 italic text-xs">—</span>
                                        ) : (


                                            <Popover
                                                placement="right"
                                                title={<div className="text-xs font-bold uppercase tracking-wider text-stone-500">Linked Feeds</div>}
                                                content={
                                                    <div className="flex flex-col gap-1 min-w-[200px]">
                                                        {topic.sources?.map(s => (
                                                            <div key={s.id} className="text-sm text-stone-700 py-1 border-b border-stone-50 last:border-0 truncate">
                                                                {s.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                }
                                            >
                                                <span className="inline-block">
                                                    <Tag
                                                        variant="solid"
                                                        color={getStringColor(topic.label)}
                                                        clickable
                                                        className={clsx(
                                                            (topic.sources || []).length === 0 && "opacity-50 grayscale"
                                                        )}
                                                    >
                                                        {(topic.sources || []).length} Sources
                                                    </Tag>
                                                </span>
                                            </Popover>
                                        )}
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

            <TopicFormDrawer
                isOpen={isCreating || !!editingTopic}
                isCreating={isCreating}
                editingTopic={editingTopic}
                formData={formData}
                onClose={() => { setIsCreating(false); setEditingTopic(null); }}
                onChange={(data) => setFormData(prev => ({ ...prev, ...data }))}
                onSave={handleSave}
            />
        </div>
    );
}
