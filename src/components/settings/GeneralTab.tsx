/**
 * GeneralTab - 通用设置标签页
 */
import { useStore } from '@nanostores/react';
import Toggle from '../ui/Toggle';
import { settingsStore, updateSetting } from '../../lib/store/settingsStore';

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
}

export default function GeneralTab({ adminKey, setAdminKey, hasKey, clearKey, savedAt, save, llmProvider, setLlmProvider, availableLLMs }: Props) {
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
                    <span className="text-xs text-stone-500 font-serif italic">
                        Status: {hasKey ? 'Configured' : 'Not Configured'}
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

                <div className="space-y-2 pt-2 border-t border-stone-100">
                    <div className="space-y-0.5">
                        <label className="text-sm font-bold text-stone-800 block">
                            LLM Provider
                        </label>
                        <p className="text-xs text-stone-500 font-serif italic">
                            Select the AI model provider for generating articles.
                        </p>
                    </div>
                    {availableLLMs.length > 0 ? (
                        <div className="flex bg-stone-100 p-1 rounded-md">
                            {availableLLMs.map(llm => (
                                <button
                                    key={llm}
                                    onClick={() => setLlmProvider(llm)}
                                    className={`flex-1 py-1.5 px-3 text-xs font-bold uppercase tracking-wider rounded-sm transition-all ${llmProvider === llm
                                        ? 'bg-white text-orange-600 shadow-sm'
                                        : 'text-stone-500 hover:text-stone-800'
                                        }`}
                                >
                                    {llm}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-stone-400 italic">No providers available</div>
                    )}
                </div>
            </div>

            {savedAt && (
                <div className="text-xs text-stone-400 font-serif italic">
                    Last saved: {new Date(savedAt).toLocaleTimeString()}
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
    const levels = [1, 2, 3] as const;

    return (
        <div className="flex gap-1">
            {levels.map((level) => (
                <button
                    key={level}
                    type="button"
                    onClick={() => updateSetting('defaultLevel', level)}
                    className={`w-8 h-6 flex items-center justify-center text-xs font-bold transition-all rounded-sm border leading-none ${settings.defaultLevel === level
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-transparent text-stone-400 border-stone-200 hover:border-stone-400 hover:text-stone-600'
                        }`}
                >
                    L{level}
                </button>
            ))}
        </div>
    );
}
