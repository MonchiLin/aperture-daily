/**
 * GlobalRssPanel - 全局 RSS 源管理面板
 * 
 * REFACTORED: Now a "Dumb Component" following Atomic Design + Headless UI patterns.
 * - All state and logic delegated to useGlobalRssPanelLogic hook
 * - UI composed of atomic sub-components
 * 
 * 允许管理员查看、添加和删除全局 RSS 源池。
 * 这些源随后可以与特定的 Topic 进行绑定。
 */
import { useGlobalRssPanelLogic } from './rss/useGlobalRssPanelLogic';
import { RssAddForm } from './rss/RssAddForm';
import { RssImportActions } from './rss/RssImportActions';
import { RssTable } from './rss/RssTable';

export default function GlobalRssPanel() {
    const {
        sources,
        loading,
        formState,
        setFormName,
        setFormUrl,
        handleCreate,
        handleDelete,
        handleImport,
        handleImportUrl
    } = useGlobalRssPanelLogic();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold font-serif text-stone-800">RSS Feeds</h3>
                    <p className="text-sm text-stone-500">Manage the global pool of news sources.</p>
                </div>
                <RssImportActions
                    onImportFile={handleImport}
                    onImportUrl={handleImportUrl}
                />
            </div>

            {/* Add Form */}
            <RssAddForm
                name={formState.name}
                url={formState.url}
                isSubmitting={formState.isSubmitting}
                onNameChange={setFormName}
                onUrlChange={setFormUrl}
                onCreate={handleCreate}
            />

            {/* Table */}
            <RssTable
                sources={sources}
                loading={loading}
                onDelete={handleDelete}
            />
        </div>
    );
}
