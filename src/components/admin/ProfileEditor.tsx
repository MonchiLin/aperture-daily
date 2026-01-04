import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import { apiFetch } from '../../lib/api';

export type GenerationProfile = {
    id: string;
    name: string;
    topic_preference: string;
    concurrency: number;
    timeout_ms: number;
    created_at: string;
    updated_at: string;
};

export type ProfileDraft = {
    id: string | null;
    name: string;
    topic_preference: string;
    concurrency: string;
    timeout_minutes: string;
};

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

    // Initial draft sync when modal opens or mode changes
    useEffect(() => {
        if (open) {
            setDraft(initialDraft);
            setError(null);
        }
    }, [open, initialDraft]);

    async function handleSubmit() {
        setError(null);
        const name = draft.name.trim();
        const topicPreference = draft.topic_preference.trim();
        if (!name) return setError('name is required');
        if (!topicPreference) return setError('topic_preference is required');

        const concurrency = Number(draft.concurrency);
        const timeoutMinutes = Number(draft.timeout_minutes);
        if (!Number.isFinite(concurrency) || concurrency <= 0 || !Number.isInteger(concurrency)) return setError('concurrency must be a positive integer');
        if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0 || !Number.isInteger(timeoutMinutes)) return setError('timeout must be a positive integer (minutes)');

        const payload = {
            name,
            topicPreference,
            concurrency,
            timeoutMs: timeoutMinutes * 60000
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
                    Configure topic preferences and execution parameters. Model is set globally via environment variable.
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
                        <label className="block text-xs font-bold uppercase tracking-widest text-stone-700">Topics</label>
                        <textarea
                            value={draft.topic_preference}
                            onChange={(e) => setDraft((d) => ({ ...d, topic_preference: e.target.value }))}
                            className="w-full px-3 py-2 bg-white border border-stone-300 focus:border-stone-500 text-stone-900 text-sm min-h-[80px] focus:outline-none"
                            placeholder="Keywords separated by commas"
                            disabled={loading}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="block text-xs font-bold uppercase tracking-widest text-stone-700">Concurrency</label>
                            <input
                                type="number"
                                value={draft.concurrency}
                                onChange={(e) => setDraft((d) => ({ ...d, concurrency: e.target.value }))}
                                className="w-full px-3 py-2 bg-white border border-stone-300 focus:border-stone-500 text-stone-900 text-sm focus:outline-none"
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-xs font-bold uppercase tracking-widest text-stone-700">Timeout (min)</label>
                            <input
                                type="number"
                                value={draft.timeout_minutes}
                                onChange={(e) => setDraft((d) => ({ ...d, timeout_minutes: e.target.value }))}
                                className="w-full px-3 py-2 bg-white border border-stone-300 focus:border-stone-500 text-stone-900 text-sm focus:outline-none"
                                disabled={loading}
                            />
                        </div>
                    </div>
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
