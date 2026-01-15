import { Pencil1Icon, PlusIcon, ReloadIcon, TrashIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import { Popconfirm } from 'antd';
import { apiFetch } from '../lib/api';
import ProfileDrawer, { type GenerationProfile, type ProfileDraft } from './settings/ProfileDrawer';
import { Tag } from './ui/Tag';
import { getStringColor } from '../lib/ui-utils';



function buildEmptyDraft(): ProfileDraft {
    return {
        id: null,
        name: '',
        topicIds: [],
    };
}

function draftFromProfile(p: GenerationProfile): ProfileDraft {
    return {
        id: p.id,
        name: p.name,
        topicIds: p.topicIds || [],
    };
}

export default function ProfilesPanel() {
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
            const data = await apiFetch<GenerationProfile[]>('/api/profiles');
            setProfiles(data || []);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refresh();
    }, []);

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
                method: 'DELETE'
            });
            await refresh();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
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
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={2} className="p-8 text-center text-stone-400 font-serif italic">
                                    No profiles found. Create one to get started.
                                </td>
                            </tr>
                        ) : (
                            rows.map((p) => (
                                <tr key={p.id} className="group hover:bg-stone-50 transition-colors">
                                    <td className="p-4">
                                        <div className="font-serif font-bold text-stone-900 mb-2">{p.name}</div>


                                        <div className="flex flex-wrap gap-1">
                                            {p.topics?.map((t) => (
                                                <Tag key={t.id} variant="solid" color={getStringColor(t.label)}>
                                                    {t.label}
                                                </Tag>
                                            ))}
                                        </div>
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
                                            <Popconfirm
                                                title="Delete Profile"
                                                description={`Delete "${p.name}"? If referenced by tasks, deletion will fail.`}
                                                onConfirm={() => removeProfile(p.id)}
                                                okText="Delete"
                                                cancelText="Cancel"
                                                okButtonProps={{ danger: true }}
                                            >
                                                <button
                                                    className="p-1 text-stone-400 hover:text-red-600 transition-colors"
                                                    title="Delete"
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

            {/* Profile Drawer */}
            <ProfileDrawer
                open={editorOpen}
                mode={editorMode}
                initialDraft={currentDraft}
                onClose={() => setEditorOpen(false)}
                onSuccess={() => void refresh()}
            />
        </div>
    );
}
