/**
 * SettingsPanel - 设置面板主入口
 * 
 * 管理 Modal 状态并分发不同 Tab 的渲染
 * 子组件已拆分到 settings/ 目录
 */
import { useState } from 'react';
import { GearIcon } from '@radix-ui/react-icons';
import { clsx } from 'clsx';
import Modal from './ui/Modal';
import ProfilesPanel from './ProfilesPanel';
import GeneralTab from './settings/GeneralTab';
import AudioTab from './settings/AudioTab';
import { useSettings } from './settings/useSettings';

const VOICES = [
	{ id: 'en-US-GuyNeural', name: 'Guy (Male, Default)' },
	{ id: 'en-US-JennyNeural', name: 'Jenny (Female)' },
	{ id: 'en-US-AriaNeural', name: 'Aria (Female)' },
	{ id: 'en-US-ChristopherNeural', name: 'Christopher (Male)' },
	{ id: 'en-US-EricNeural', name: 'Eric (Male)' },
	{ id: 'en-US-MichelleNeural', name: 'Michelle (Female)' },
];

export default function SettingsPanel() {
	const [open, setOpen] = useState(false);
	const {
		adminKey,
		setAdminKey,
		savedAt,
		isAdmin,
		voice,
		setVoiceSettings,
		tab,
		setTab,
		hasKey,
		save,
		clearKey
	} = useSettings();

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
				{/* Tab Navigation */}
				<div className="flex border-b border-stone-200 mb-6">
					<TabButton
						active={tab === 'general'}
						onClick={() => setTab('general')}
					>
						General
					</TabButton>
					<TabButton
						active={tab === 'audio'}
						onClick={() => setTab('audio')}
					>
						Audio
					</TabButton>
					{isAdmin && (
						<TabButton
							active={tab === 'profiles'}
							onClick={() => setTab('profiles')}
						>
							Profiles
						</TabButton>
					)}
				</div>

				{/* Tab Content */}
				{tab === 'general' ? (
					<GeneralTab
						adminKey={adminKey}
						setAdminKey={setAdminKey}
						hasKey={hasKey}
						clearKey={clearKey}
						savedAt={savedAt}
						save={save}
					/>
				) : tab === 'audio' ? (
					<AudioTab
						voices={VOICES}
						voice={voice}
						setVoiceSettings={setVoiceSettings}
						savedAt={savedAt}
						save={save}
					/>
				) : (
					isAdmin && <ProfilesPanel />
				)}
			</Modal>
		</>
	);
}

/**
 * TabButton - 标签页按钮
 */
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			onClick={onClick}
			className={clsx(
				"px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
				active ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"
			)}
		>
			{children}
		</button>
	);
}
