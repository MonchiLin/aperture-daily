/**
 * GeneralTab - 通用设置标签页
 */
import { useStore } from '@nanostores/react';
import { Cpu, Sparkles, Brain } from 'lucide-react';
import Toggle from '../ui/Toggle';
import SegmentedControl from '../ui/SegmentedControl';
import { clsx } from 'clsx';
import { settingsStore, updateSetting } from '../../lib/store/settingsStore';
import { dayjs } from '@server/lib/time';

interface Props {
    adminKey: string;
    setAdminKey: (key: string) => void;
    hasKey: boolean;
    clearKey: () => void;
    savedAt: number | null;
    save: () => void;
    llmProvider: string;
    setLlmProvider: (llm: string) => void;
    availableLLMs: string[];
    isAdmin?: boolean;
}

export default function GeneralTab({
    adminKey,
    setAdminKey,
    hasKey,
    clearKey,
    savedAt,
    save,
    llmProvider,
    setLlmProvider,
    availableLLMs,
    isAdmin
}: Props) {
    const llmOptions = [
        {
            id: 'gemini',
            label: 'Gemini',
            icon: <Sparkles size={12} />,
            unconfigured: availableLLMs.length > 0 && !availableLLMs.includes('gemini')
        },
        {
            id: 'openai',
            label: 'OpenAI',
            icon: <Cpu size={12} />,
            unconfigured: availableLLMs.length > 0 && !availableLLMs.includes('openai')
        },
        {
            id: 'claude',
            label: 'Claude',
            icon: <Brain size={12} />,
            unconfigured: availableLLMs.length > 0 && !availableLLMs.includes('claude')
        },
    ];

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <label className="block text-sm font-serif font-bold text-stone-800">
                    Admin Key
                </label>
                <input
                    type="text"
                    placeholder="Enter Admin Key (Stored locally)"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    className="w-full px-4 py-2 bg-white border border-stone-300 focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500 text-stone-900 placeholder:text-stone-400 text-sm"
                />
                <div className="flex items-center justify-between mt-1">
                    <span className={clsx(
                        "text-xs font-serif italic",
                        adminKey.trim() ? "text-amber-600" : isAdmin ? "text-green-600" : "text-stone-500"
                    )}>
                        Status: {adminKey.trim() ? 'Ready to verify' : isAdmin ? 'Active (Authenticated)' : 'Not Configured'}
                    </span>
                    <button
                        type="button"
                        onClick={clearKey}
                        disabled={!hasKey}
                        className="text-xs text-stone-400 hover:text-red-600 disabled:opacity-30 underline decoration-dotted underline-offset-4"
                    >
                        Clear Key
                    </button>
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-stone-200">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <label className="text-sm font-bold text-stone-800 block">
                            Smart Copy
                        </label>
                        <p className="text-xs text-stone-500 font-serif italic">
                            Automatically copy text to clipboard when selecting a sentence.
                        </p>
                    </div>
                    <SmartCopyToggle />
                </div>

                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <label className="text-sm font-bold text-stone-800 block">
                            Default Level
                        </label>
                        <p className="text-xs text-stone-500 font-serif italic">
                            Default difficulty level when opening articles for the first time.
                        </p>
                    </div>
                    <DefaultLevelSelector />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                    <div className="space-y-0.5">
                        <label className="text-sm font-bold text-stone-800 block">
                            LLM Provider
                        </label>
                        <p className="text-xs text-stone-500 font-serif italic">
                            AI model provider for generating articles.
                        </p>
                    </div>

                    <SegmentedControl
                        value={llmProvider}
                        onChange={setLlmProvider}
                        options={llmOptions as any}
                        layoutId="llm-provider-pill"
                    />
                </div>
            </div>

            {savedAt && (
                <div className="text-xs text-stone-400 font-serif italic">
                    Last saved: {dayjs(savedAt).tz().format('HH:mm:ss')}
                </div>
            )}

            <div className="flex justify-end pt-4 border-t border-stone-200">
                <button
                    onClick={save}
                    className="px-6 py-2 bg-stone-900 !text-white text-sm font-bold rounded-sm hover:bg-stone-700"
                >
                    Save Changes
                </button>
            </div>
        </div>
    );
}

/**
 * Smart Copy Toggle - Uses settingsStore
 */
function SmartCopyToggle() {
    const settings = useStore(settingsStore);

    return (
        <Toggle
            checked={settings.autoCopy}
            onChange={(val) => updateSetting('autoCopy', val)}
            label="Smart Copy"
        />
    );
}

/**
 * Default Level Selector - Uses settingsStore
 */
function DefaultLevelSelector() {
    const settings = useStore(settingsStore);
    const levels = [
        { id: 1, label: 'L1' },
        { id: 2, label: 'L2' },
        { id: 3, label: 'L3' }
    ] as const;

    return (
        <SegmentedControl
            value={settings.defaultLevel}
            onChange={(val) => updateSetting('defaultLevel', val as any)}
            options={levels as any}
            layoutId="default-level-pill"
        />
    );
}
