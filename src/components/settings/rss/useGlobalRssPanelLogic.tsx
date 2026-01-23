/**
 * useGlobalRssPanelLogic - Headless logic hook for GlobalRssPanel
 * 
 * Separates all state management and API calls from the UI layer.
 * Following the "Headless UI" pattern for better testability and reusability.
 */
import { useState, useEffect, useCallback } from 'react';
import { message, Modal, Input } from 'antd';
import { apiFetch } from '../../../lib/api';

export interface NewsSource {
    id: string;
    name: string;
    url: string;
    is_active: boolean;
    topics?: { id: string; label: string }[];
}

interface FormState {
    name: string;
    url: string;
    isSubmitting: boolean;
}

interface ImportResult {
    success: boolean;
    totalFound: number;
    added: number;
    message?: string;
}

export function useGlobalRssPanelLogic() {
    // List state
    const [sources, setSources] = useState<NewsSource[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [formState, setFormState] = useState<FormState>({
        name: '',
        url: '',
        isSubmitting: false
    });

    const fetchSources = useCallback(async () => {
        try {
            const data = await apiFetch<NewsSource[]>('/api/rss');
            setSources(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSources();
    }, [fetchSources]);

    const setFormName = useCallback((name: string) => {
        setFormState(prev => ({ ...prev, name }));
    }, []);

    const setFormUrl = useCallback((url: string) => {
        setFormState(prev => ({ ...prev, url }));
    }, []);

    const handleCreate = useCallback(async () => {
        if (!formState.name || !formState.url) return;

        setFormState(prev => ({ ...prev, isSubmitting: true }));
        try {
            await apiFetch('/api/rss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: formState.name, url: formState.url })
            });
            setFormState({ name: '', url: '', isSubmitting: false });
            fetchSources();
        } catch (e) {
            message.error('Failed to create source. Check URL or duplicates.');
            setFormState(prev => ({ ...prev, isSubmitting: false }));
        }
    }, [formState.name, formState.url, fetchSources]);

    const handleDelete = useCallback(async (id: string) => {
        try {
            await apiFetch(`/api/rss/${id}`, { method: 'DELETE' });
            setSources(prev => prev.filter(s => s.id !== id));
        } catch (e) {
            message.error('Failed to delete source');
        }
    }, []);

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const content = ev.target?.result as string;
            if (!content) return;

            try {
                setLoading(true);
                const res = await apiFetch<ImportResult>('/api/rss/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ opml_content: content })
                });

                if (res.success) {
                    message.success(`Import successful! Found ${res.totalFound} feeds, added ${res.added} new.`);
                    fetchSources();
                } else {
                    message.error('Import failed: ' + res.message);
                }
            } catch (err) {
                console.error(err);
                message.error('Import failed due to server error.');
            } finally {
                setLoading(false);
                // Reset file input
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }, [fetchSources]);

    const handleImportUrl = useCallback(() => {
        let inputUrl = '';

        Modal.confirm({
            title: 'Import from URL',
            icon: null,
            content: (
                <Input
                    placeholder= "Enter OPML URL (e.g. public export link)"
                    onChange={(e) => { inputUrl = e.target.value; }
}
                />
            ),
okText: 'Import',
    cancelText: 'Cancel',
        onOk: async () => {
            if (!inputUrl) return;

            try {
                setLoading(true);
                const res = await apiFetch<ImportResult>('/api/rss/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: inputUrl })
                });

                if (res.success) {
                    message.success(`Import successful! Found ${res.totalFound} feeds, added ${res.added} new.`);
                    fetchSources();
                } else {
                    message.error('Import failed: ' + res.message);
                }
            } catch (err) {
                console.error(err);
                message.error('Import failed due to server error.');
            } finally {
                setLoading(false);
            }
        }
        });
    }, [fetchSources]);

return {
    // List state
    sources,
    loading,
    // Form state & setters
    formState,
    setFormName,
    setFormUrl,
    // Actions
    handleCreate,
    handleDelete,
    handleImport,
    handleImportUrl
};
}
