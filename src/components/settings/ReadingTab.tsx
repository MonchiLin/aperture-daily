import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { BookOpen, Sparkles, Check, Loader2 } from 'lucide-react';
import SegmentedControl from '../ui/SegmentedControl';
import {
    settingsStore,
    updateReadingStyle,
    type GenerationMode,
    type ReadingStyle,
} from '../../lib/store/settingsStore';
import clsx from 'clsx';

const STYLE_OPTIONS = [
    { id: 'default' as const, label: 'Default' },
    { id: 'impression' as const, label: 'Impression' },
];

interface StyleSelectorProps {
    value: ReadingStyle;
    onChange: (style: ReadingStyle) => void;
    layoutId: string;
}

function StyleSelector({ value, onChange, layoutId }: StyleSelectorProps) {
    return (
        <SegmentedControl
            value={value}
            onChange={onChange}
            options={STYLE_OPTIONS}
            layoutId={layoutId}
        />
    );
}

export default function ReadingTab() {
    const settings = useStore(settingsStore);
    const [draft, setDraft] = useState(settings.readingStyles ?? {
        rss: 'default',
        impression: 'impression',
    });
    const [saving, setSaving] = useState(false);
    const [didSave, setDidSave] = useState(false);

    // Sync draft with store only on mount to allow local editing
    useEffect(() => {
        if (settings.readingStyles) {
            setDraft(_current => ({
                ...settings.readingStyles,
                // Only update if current matches store (no local changes)? 
                // Actually simple approach: Initial State only, or we accept overwrite if store changes externally.
                // Given this is a modal, simpler is fine.
            }));
        }
    }, []);

    const handleStyleChange = (mode: GenerationMode, style: ReadingStyle) => {
        setDraft(prev => ({ ...prev, [mode]: style }));
        setDidSave(false);
    };

    const hasChanges =
        draft.rss !== (settings.readingStyles?.rss ?? 'default') ||
        draft.impression !== (settings.readingStyles?.impression ?? 'impression');

    const handleSave = async () => {
        setSaving(true);

        // Simulate network/processing delay for UX
        await new Promise(resolve => setTimeout(resolve, 600));

        // 1. Update Store
        Object.entries(draft).forEach(([mode, style]) => {
            updateReadingStyle(mode as GenerationMode, style as ReadingStyle);
        });

        // 2. Check context and Reload if needed
        const isArticlePage = document.querySelector('[data-article-page]') !== null;

        if (isArticlePage) {
            window.location.reload();
        } else {
            setSaving(false);
            setDidSave(true);
            setTimeout(() => setDidSave(false), 2000);
        }
    };

    return (
        <div className="space-y-6 relative h-full flex flex-col">
            <div className="flex-1 space-y-6">
                {/* RSS Mode */}
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <label className="text-sm font-bold text-stone-800 flex items-center gap-2">
                            <BookOpen size={14} className="text-stone-500" />
                            RSS Mode
                        </label>
                        <p className="text-xs text-stone-500 font-serif italic">
                            Reading style for daily news articles.
                        </p>
                    </div>
                    <StyleSelector
                        value={draft.rss}
                        onChange={(style) => handleStyleChange('rss', style)}
                        layoutId="rss-style-pill"
                    />
                </div>

                {/* Impression Mode */}
                <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                    <div className="space-y-0.5">
                        <label className="text-sm font-bold text-stone-800 flex items-center gap-2">
                            <Sparkles size={14} className="text-amber-500" />
                            Impression Mode
                        </label>
                        <p className="text-xs text-stone-500 font-serif italic">
                            Reading style for random vocabulary articles.
                        </p>
                    </div>
                    <StyleSelector
                        value={draft.impression}
                        onChange={(style) => handleStyleChange('impression', style)}
                        layoutId="impression-style-pill"
                    />
                </div>

                {/* Style Description */}
                <div className="pt-4 border-t border-stone-200 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400">
                        Style Comparison
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="p-3 bg-stone-50 rounded border border-stone-100">
                            <div className="font-bold text-stone-700 mb-1">Default</div>
                            <ul className="text-stone-500 space-y-0.5 font-serif italic">
                                <li>• Two-column layout with sidebar</li>
                                <li>• Margin Notes for vocabulary</li>
                                <li>• Historical Echoes on hover</li>
                            </ul>
                        </div>
                        <div className="p-3 bg-amber-50/50 rounded border border-amber-100">
                            <div className="font-bold text-amber-700 mb-1">Impression</div>
                            <ul className="text-stone-500 space-y-0.5 font-serif italic">
                                <li>• Single-column centered layout</li>
                                <li>• Click for word details popover</li>
                                <li>• Clean, distraction-free design</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Footer Action */}
            <div className="pt-4 mt-auto border-t border-stone-100 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={!hasChanges || saving}
                    className={clsx(
                        "px-6 py-2 rounded-sm text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                        hasChanges
                            ? "bg-stone-900 text-white hover:bg-stone-800 shadow-sm"
                            : "bg-stone-100 text-stone-400 cursor-not-allowed",
                        saving && "opacity-80 cursor-wait"
                    )}
                >
                    {saving ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            Saving...
                        </>
                    ) : didSave ? (
                        <>
                            <Check size={14} />
                            Saved
                        </>
                    ) : (
                        "Save Changes"
                    )}
                </button>
            </div>
        </div>
    );
}
