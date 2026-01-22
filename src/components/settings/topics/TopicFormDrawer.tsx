import { Drawer } from 'antd';
import RssSourceManager from '../RssSourceManager';

interface Topic {
    id: string;
    label: string;
    prompts?: string;
    is_active: boolean;
    sources?: { id: string; name: string }[];
}

interface TopicFormDrawerProps {
    isOpen: boolean;
    isCreating: boolean;
    editingTopic: Topic | null;
    formData: {
        label: string;
        prompts: string;
        is_active: boolean;
    };
    onClose: () => void;
    onChange: (data: Partial<{
        label: string;
        prompts: string;
        is_active: boolean;
    }>) => void;
    onSave: () => void;
}

export default function TopicFormDrawer({
    isOpen,
    isCreating,
    editingTopic,
    formData,
    onClose,
    onChange,
    onSave
}: TopicFormDrawerProps) {
    return (
        <Drawer
            title={<span className="font-serif font-bold text-lg text-stone-800">{isCreating ? 'Create New Topic' : `Edit Topic: ${editingTopic?.label}`}</span>}
            placement="right"
            onClose={onClose}
            open={isOpen}
            size="large"
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
                            onChange={e => onChange({ label: e.target.value })}
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
                            onChange={e => onChange({ prompts: e.target.value })}
                            className="w-full px-4 py-3 border border-stone-200 rounded-sm focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-200 font-mono text-xs h-32 leading-relaxed transition-all"
                            placeholder="e.g., Focus on AI and Chip market. Avoid consumer gadgets."
                        />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={formData.is_active}
                            onChange={e => onChange({ is_active: e.target.checked })}
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
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!formData.label}
                        className="px-6 py-2.5 bg-stone-900 text-white text-sm font-bold uppercase tracking-wider rounded-sm hover:bg-stone-800 disabled:opacity-50 transition-all shadow-sm"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </Drawer>
    );
}
