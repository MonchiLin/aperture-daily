/**
 * AudioTab - 音频设置标签页
 */
import { clsx } from 'clsx';
import { EdgeTTSClient } from '../../lib/features/audio/edge-client';

export interface VoiceOption {
    id: string;
    name: string;
}

interface Props {
    voices: VoiceOption[];
    voice: string;
    setVoiceSettings: (voice: string) => void;
    savedAt: number | null;
    save: () => void;
}

export default function AudioTab({ voices, voice, setVoiceSettings, savedAt, save }: Props) {
    async function previewVoice(e: React.MouseEvent<HTMLButtonElement>, voiceId: string) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const originalContent = btn.innerHTML;

        try {
            btn.disabled = true;
            btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

            const client = new EdgeTTSClient(voiceId);
            const result = await client.synthesize("Hello, this is a test of my voice.", 1.0);

            const audio = new Audio(URL.createObjectURL(result.audioBlob));
            audio.play();

            audio.onended = () => {
                btn.disabled = false;
                btn.innerHTML = originalContent;
            };
        } catch (err) {
            console.error(err);
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <label className="block text-sm font-serif font-bold text-stone-800">
                    TTS Voice (Speaker)
                </label>

                <div className="border border-stone-200 rounded-lg divide-y divide-stone-100 bg-white">
                    {voices.map((v) => (
                        <div
                            key={v.id}
                            className={clsx(
                                "flex items-center justify-between px-4 py-3 transition-colors cursor-pointer hover:bg-stone-50",
                                voice === v.id ? "bg-stone-50/80" : ""
                            )}
                            onClick={() => setVoiceSettings(v.id)}
                        >
                            <div className="flex items-center gap-3">
                                <div className={clsx(
                                    "w-4 h-4 rounded-full border flex items-center justify-center",
                                    voice === v.id ? "border-slate-900" : "border-stone-300"
                                )}>
                                    {voice === v.id && <div className="w-2 h-2 rounded-full bg-slate-900" />}
                                </div>
                                <span className={clsx("text-sm", voice === v.id ? "font-bold text-slate-900" : "text-stone-600")}>
                                    {v.name}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={(e) => previewVoice(e, v.id)}
                                className="p-1.5 rounded-full hover:bg-stone-200 text-stone-400 hover:text-slate-900 transition-all ml-4"
                                title="Preview Voice"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
                <div className="text-xs text-stone-500 font-serif italic mt-1 px-1">
                    Choose a speaker. Click the play button to preview their voice.
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
