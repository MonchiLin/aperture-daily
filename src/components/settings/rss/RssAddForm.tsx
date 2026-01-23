/**
 * RssAddForm - "Add New Feed" form component
 * 
 * Atomic Design: Molecule
 * Handles the form UI for adding new RSS sources.
 */
import { PlusIcon } from '@radix-ui/react-icons';

interface RssAddFormProps {
    name: string;
    url: string;
    isSubmitting: boolean;
    onNameChange: (name: string) => void;
    onUrlChange: (url: string) => void;
    onCreate: () => void;
}

export function RssAddForm({
    name,
    url,
    isSubmitting,
    onNameChange,
    onUrlChange,
    onCreate
}: RssAddFormProps) {
    return (
        <div className="p-4 bg-white border border-stone-200 rounded-sm shadow-sm space-y-3">
            <div className="text-xs font-bold uppercase text-stone-400 tracking-wider">Add New Feed</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                    placeholder="Source Name (e.g. The Verge)"
                    value={name}
                    onChange={e => onNameChange(e.target.value)}
                    className="px-3 py-2 border border-stone-200 rounded-sm text-sm focus:outline-none focus:border-stone-400"
                />
                <input
                    placeholder="https://..."
                    value={url}
                    onChange={e => onUrlChange(e.target.value)}
                    className="px-3 py-2 border border-stone-200 rounded-sm text-sm font-mono focus:outline-none focus:border-stone-400"
                />
            </div>
            <div className="flex justify-end">
                <button
                    onClick={onCreate}
                    disabled={!name || !url || isSubmitting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-stone-50 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-stone-700 disabled:opacity-50 transition-colors"
                >
                    <PlusIcon /> Add Source
                </button>
            </div>
        </div>
    );
}
