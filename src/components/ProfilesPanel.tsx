import { Pencil1Icon, PlusIcon, ReloadIcon, TrashIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import ProfileEditor, { type GenerationProfile, type ProfileDraft } from './admin/ProfileEditor';

function splitTopicTags(input: string) {
    const parts = input
        .split(/[,，\n;；|]+/g)
        .map((x) => x.trim())
        .filter(Boolean);
    return Array.from(new Set(parts));
}

function buildEmptyDraft(): ProfileDraft {
    return {
        id: null,
        name: '',
        topic_preference: '',
        concurrency: '1',
        timeout_minutes: '30'
    };
}

function draftFromProfile(p: GenerationProfile): ProfileDraft {
    return {
        id: p.id,
        name: p.name,
        topic_preference: p.topic_preference,
        concurrency: String(p.concurrency),
        timeout_minutes: String(Math.round(p.timeout_ms / 60000))
    };
}

export default function ProfilesPanel(props: { adminKey: string }) {
    const adminKey = props.adminKey;

    const [profiles, setProfiles] = useState<GenerationProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [currentDraft, setCurrentDraft] = useState<ProfileDraft>(buildEmptyDraft());

    const rows = useMemo(() => [...profiles].sort((a, b) => a.name.localeCompare(b.name)), [profiles]);

    async function refresh() {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<GenerationProfile[]>('/api/profiles', { token: adminKey });
            setProfiles(data || []);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!adminKey) return;
        void refresh();
    }, [adminKey]);

    function openCreate() {
        setEditorMode('create');
        setCurrentDraft(buildEmptyDraft());
        setEditorOpen(true);
    }

    function openEdit(p: GenerationProfile) {
        setEditorMode('edit');
        setCurrentDraft(draftFromProfile(p));
        setEditorOpen(true);
    }

    async function removeProfile(id: string) {
        setLoading(true);
        setError(null);
        try {
            await apiFetch(`/api/profiles/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                token: adminKey
            });
            await refresh();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    function confirmDelete(p: GenerationProfile) {
        if (window.confirm(`Delete profile "${p.name}"? If it is referenced by tasks, deletion will fail.`)) {
            removeProfile(p.id);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h3 className="text-lg font-serif font-bold text-stone-900">Generation Profiles</h3>
                    <p className="text-sm text-stone-500 font-serif italic">
                        Configure topic preferences and execution parameters.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-stone-600 hover:text-stone-900 border border-transparent hover:border-stone-300 rounded-sm transition-all"
                    >
                        <div className="flex items-center gap-2">
                            <ReloadIcon className={loading ? 'animate-spin' : ''} />
                            Refresh
                        </div>
                    </button>
                    <button
                        onClick={openCreate}
                        disabled={loading}
                        className="px-4 py-1.5 bg-stone-900 !text-white text-sm font-bold rounded-sm hover:bg-stone-700"
                    >
                        <div className="flex items-center gap-2">
                            <PlusIcon />
                            New Profile
                        </div>
                    </button>
                </div>
            </div>

            {error && (
                <div className="text-sm text-red-600 bg-red-50 p-4 border-l-2 border-red-600 font-serif italic">
                    {error}
                </div>
            )}

            {/* Table */}
            <div className="border border-stone-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold uppercase tracking-widest text-stone-500">
                            <th className="p-4 font-medium">Name / Topics</th>
                            <th className="p-4 font-medium">Concurrency</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="p-8 text-center text-stone-400 font-serif italic">
                                    No profiles found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            rows.map((p) => (
                                <tr key={p.id} className="group hover:bg-stone-50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-serif font-bold text-stone-900 mb-2">{p.name}</div>
                                        <div className="flex flex-wrap gap-1">
                                            {splitTopicTags(p.topic_preference).map((t) => (
                                                <span key={t} className="px-2 py-0.5 bg-white border border-stone-200 text-[10px] text-stone-500 uppercase tracking-wide rounded-full">
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm text-stone-500">
                                        {p.concurrency} / {Math.round(p.timeout_ms / 60000)} min
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openEdit(p)}
                                                className="p-1 text-stone-400 hover:text-stone-900 transition-colors"
                                                title="Edit"
                                            >
                                                <Pencil1Icon />
                                            </button>
                                            <button
                                                onClick={() => confirmDelete(p)}
                                                className="p-1 text-stone-400 hover:text-red-600 transition-colors"
                                                title="Delete"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Profile Editor (Extracted Component) */}
            <ProfileEditor
                open={editorOpen}
                mode={editorMode}
                initialDraft={currentDraft}
                adminKey={adminKey}
                onClose={() => setEditorOpen(false)}
                onSuccess={() => void refresh()}
            />
        </div>
    );
}
