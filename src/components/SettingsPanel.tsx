import { GearIcon } from '@radix-ui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import ProfilesPanel from './ProfilesPanel';
import Modal from './ui/Modal';
import { clsx } from 'clsx';
import { isAdminStore, verifyAndSetAdmin } from '../lib/store/adminStore';
import { useStore } from '@nanostores/react';

const ADMIN_KEY_STORAGE = 'aperture-daily_admin_key';

export default function SettingsPanel() {
	const [open, setOpen] = useState(false);
	const [adminKey, setAdminKey] = useState('');
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const isAdmin = useStore(isAdminStore);
	const [voice, setVoiceSettings] = useState('en-US-GuyNeural');
	const [tab, setTab] = useState<'general' | 'audio' | 'profiles'>('general');

	const hasKey = useMemo(() => adminKey.trim().length > 0, [adminKey]);

	const voices = [
		{ id: 'en-US-GuyNeural', name: 'Guy (Male, Default)' },
		{ id: 'en-US-JennyNeural', name: 'Jenny (Female)' },
		{ id: 'en-US-AriaNeural', name: 'Aria (Female)' },
		{ id: 'en-US-ChristopherNeural', name: 'Christopher (Male)' },
		{ id: 'en-US-EricNeural', name: 'Eric (Male)' },
		{ id: 'en-US-MichelleNeural', name: 'Michelle (Female)' },
	];

	useEffect(() => {
		try {
			const storedKey = localStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
			setAdminKey(storedKey);

			const storedVoice = localStorage.getItem('aperture-daily_voice_preference');
			if (storedVoice) setVoiceSettings(storedVoice);
		} catch { /* ignore */ }
	}, []);

	useEffect(() => {
		if (!isAdmin && tab === 'profiles') setTab('general');
	}, [isAdmin, tab]);

	async function save() {
		const nextKey = adminKey.trim();
		try {
			if (nextKey) localStorage.setItem(ADMIN_KEY_STORAGE, nextKey);
			else localStorage.removeItem(ADMIN_KEY_STORAGE);

			localStorage.setItem('aperture-daily_voice_preference', voice);
			// Dynamic import to avoid SSR issues if called there, though this is client side
			import('../lib/store/audioStore').then(mod => {
				mod.setVoice(voice);
			});

			setSavedAt(Date.now());
		} catch { /* ignore */ }

		await verifyAndSetAdmin(nextKey);
	}

	function clearKey() {
		setAdminKey('');
		try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch { /* ignore */ }
		verifyAndSetAdmin(null);
	}

	return (
		<>
			<button
				onClick={() => setOpen(true)}
				className="flex items-center gap-2 px-3 py-1.5 border border-transparent hover:border-stone-300 hover:bg-stone-100 transition-all rounded-sm group text-stone-500 hover:text-stone-900"
			>
				<span className="text-xs font-bold uppercase tracking-widest hidden md:inline-block">Settings</span>
				<GearIcon className="w-4 h-4" />
			</button>

			<Modal
				title={
					<div className="flex items-center gap-3">
						<span>Configuration</span>
						<span className={clsx(
							"px-2 py-0.5 text-[10px] uppercase tracking-wider font-sans border rounded-full font-bold",
							isAdmin ? "bg-green-50 text-green-700 border-green-200" :
								hasKey ? "bg-amber-50 text-amber-700 border-amber-200" :
									"bg-stone-100 text-stone-500 border-stone-200"
						)}>
							{isAdmin ? 'Admin' : hasKey ? 'Key Found' : 'No Access'}
						</span>
					</div>
				}
				open={open}
				onClose={() => setOpen(false)}
				width={800}
			>
				<div className="flex border-b border-stone-200 mb-6">
					<button
						onClick={() => setTab('general')}
						className={clsx(
							"px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
							tab === 'general' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"
						)}
					>
						General
					</button>
					<button
						onClick={() => setTab('audio')}
						className={clsx(
							"px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
							tab === 'audio' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"
						)}
					>
						Audio
					</button>
					{isAdmin && (
						<button
							onClick={() => setTab('profiles')}
							className={clsx(
								"px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
								tab === 'profiles' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"
							)}
						>
							Profiles
						</button>
					)}
				</div>

				{tab === 'general' ? (
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
				) : tab === 'audio' ? (
					<div className="space-y-6">
						<div className="space-y-3">
							<label className="block text-sm font-serif font-bold text-stone-800">
								TTS Voice (Speaker)
							</label>

							<div className="border border-stone-200 rounded-lg divide-y divide-stone-100 bg-white">
								{voices.map(v => (
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
											onClick={async (e) => {
												e.stopPropagation();
												const btn = e.currentTarget;
												const originalContent = btn.innerHTML;

												try {
													// Set Loading State
													btn.disabled = true;
													btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-slate-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

													// Dynamic import to avoid SSR issues
													const { EdgeTTSClient } = await import('../lib/tts/edge-client');
													const client = new EdgeTTSClient(v.id);
													const result = await client.synthesize("Hello, this is a test of my voice.", 1.0);

													const audio = new Audio(URL.createObjectURL(result.audioBlob));
													audio.play();

													// Wait for audio to finish roughly (or just reset after a few seconds)
													audio.onended = () => {
														btn.disabled = false;
														btn.innerHTML = originalContent;
													};
												} catch (err) {
													console.error(err);
													btn.disabled = false;
													btn.innerHTML = originalContent;
												}
											}}
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
				) : (
					isAdmin && <ProfilesPanel adminKey={adminKey.trim()} />
				)}
			</Modal>
		</>
	);
}
