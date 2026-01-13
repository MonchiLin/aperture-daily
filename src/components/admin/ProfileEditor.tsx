
import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { apiFetch } from '../../lib/api';
import { clsx } from 'clsx';

export type GenerationProfile = {
    id: string;
    name: string;
    topicIds?: string[];
    topics?: { id: string; label: string }[]; // [New] For display
    createdAt: string;
    updatedAt: string;
};

export type ProfileDraft = {
    id: string | null;
    name: string;
    topicIds: string[]; // [New] Selected IDs
};

interface Topic {
    id: string;
    label: string;
    is_active: boolean;
}

interface ProfileEditorProps {
    open: boolean;
    mode: 'create' | 'edit';
    initialDraft: ProfileDraft;
    onClose: () => void;
    onSuccess: () => void;
}

export default function ProfileEditor({ open, mode, initialDraft, onClose, onSuccess }: ProfileEditorProps) {
    const [draft, setDraft] = useState<ProfileDraft>(initialDraft);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);

    // Initial draft sync when modal opens or mode changes
    useEffect(() => {
        if (open) {
            setDraft(initialDraft);
            setError(null);
            fetchTopics();
        }
    }, [open, initialDraft]);

    const fetchTopics = async () => {
        try {
            const res = await apiFetch<Topic[]>('/api/topics');
            if (res) {
                setAvailableTopics(res.filter(t => t.is_active)); // Only show active topics
            }
        } catch (e) {
            console.error('Failed to fetch topics', e);
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
        // Allow empty topics? No, require at least one.
        if (!name) return setError('Name is required');

        // Validation: Must select at least one topic (either via IDs or legacy string if we allowed it, but here we enforce IDs)
        if (draft.topicIds.length === 0) {
            return setError('Please select at least one topic');
        }

        if (draft.topicIds.length === 0) {
            return setError('Please select at least one topic');
        }

        const payload = {
            name,
            topicIds: draft.topicIds, // Send IDs
        };

        setLoading(true);
        try {
            if (mode === 'create') {
                await apiFetch('/api/profiles', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else if (draft.id) {
                await apiFetch(`/api/profiles/${encodeURIComponent(draft.id)}`, {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            onSuccess();
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal
            title={mode === 'create' ? 'Create Profile' : 'Edit Profile'}
            open={open}
            onClose={onClose}
            width={600}
        >
            <div className="space-y-6">
                <p className="text-sm text-stone-500 font-serif italic mb-4">
                    Configure topic preferences and execution parameters.
                </p>

                {error && (
                    <div className="text-sm text-red-600 bg-red-50 p-4 border-l-2 border-red-600 font-serif italic">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="block text-xs font-bold uppercase tracking-widest text-stone-700">Name</label>
                        <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                            className="w-full px-3 py-2 bg-white border border-stone-300 focus:border-stone-500 text-stone-900 text-sm focus:outline-none"
                            placeholder="e.g. Daily General"
                            disabled={loading}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-bold uppercase tracking-widest text-stone-700 mb-2">Topics</label>
                        <div className="border border-stone-200 rounded p-3 max-h-60 overflow-y-auto bg-stone-50">
                            {availableTopics.length === 0 ? (
                                <div className="text-stone-400 text-sm italic p-2">No active topics found. Add topics in the Topics tab first.</div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {availableTopics.map(topic => (
                                        <label key={topic.id} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-white rounded transition-colors group">
                                            <input
                                                type="checkbox"
                                                checked={draft.topicIds.includes(topic.id)}
                                                onChange={() => toggleTopic(topic.id)}
                                                className="w-4 h-4 text-stone-900 border-stone-300 rounded focus:ring-stone-500"
                                            />
                                            <span className={clsx("text-sm", draft.topicIds.includes(topic.id) ? "text-stone-900 font-bold" : "text-stone-600")}>
                                                {topic.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-stone-400 pt-1">Select at least one topic.</p>
                    </div>

                    {/* Concurrency/Timeout removed */}
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-stone-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-stone-100 text-stone-600 text-xs font-bold uppercase tracking-widest hover:bg-stone-200 transition-colors"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => void handleSubmit()}
                        disabled={loading}
                        className="px-6 py-2 bg-stone-900 !text-white text-sm font-bold rounded-sm hover:bg-stone-700 disabled:opacity-50"
                    >
                        {loading ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
