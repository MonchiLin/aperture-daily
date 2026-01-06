/**
 * useSettings - 设置面板业务逻辑 Hook
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { isAdminStore, login } from '../../lib/store/adminStore';
import { setVoice } from '../../lib/store/audioStore';

export type SettingsTab = 'general' | 'audio' | 'profiles';

export function useSettings() {
    const [adminKey, setAdminKey] = useState('');
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [voice, setVoiceSettings] = useState('en-US-GuyNeural');
    const [tab, setTab] = useState<SettingsTab>('general');

    const isAdmin = useStore(isAdminStore);

    const hasKey = useMemo(() => adminKey.trim().length > 0, [adminKey]);

    useEffect(() => {
        try {
            const storedVoice = localStorage.getItem('aperture-daily_voice_preference');
            if (storedVoice) setVoiceSettings(storedVoice);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        if (!isAdmin && tab === 'profiles') setTab('general');
    }, [isAdmin, tab]);

    // 保存设置并登录
    async function save() {
        const nextKey = adminKey.trim();

        // 保存音频设置
        try {
            localStorage.setItem('aperture-daily_voice_preference', voice);
            setVoice(voice);
        } catch { /* ignore */ }

        // 调用登录 API 设置 HttpOnly Cookie
        if (nextKey) {
            await login(nextKey);
        }

        setSavedAt(Date.now());
    }

    function clearKey() {
        setAdminKey('');
    }

    return {
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
    };
}
