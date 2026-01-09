/**
 * useSettings - 设置面板业务逻辑 Hook
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { isAdminStore, login } from '../../lib/store/adminStore';
import { setVoice } from '../../lib/store/audioStore';

import { apiFetch } from '../../lib/api';

export type SettingsTab = 'general' | 'audio' | 'profiles';

export function useSettings() {
    const [adminKey, setAdminKey] = useState('');
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [voice, setVoiceSettings] = useState('en-US-GuyNeural');
    const [tab, setTab] = useState<SettingsTab>('general');

    // LLM Settings
    const [availableLLMs, setAvailableLLMs] = useState<string[]>([]);
    const [llmProvider, setLlmProvider] = useState<string>('');

    const isAdmin = useStore(isAdminStore);

    const hasKey = useMemo(() => adminKey.trim().length > 0, [adminKey]);

    useEffect(() => {
        try {
            const storedVoice = localStorage.getItem('aperture-daily_voice_preference');
            if (storedVoice) setVoiceSettings(storedVoice);

            // Fetch LLM Config and sync with local storage
            apiFetch<{ current_llm: string; available_llms: string[] }>('/api/config/llm')
                .then(data => {
                    if (data) {
                        setAvailableLLMs(data.available_llms);
                        const savedLlm = localStorage.getItem('admin_selected_llm');
                        if (savedLlm && data.available_llms.includes(savedLlm)) {
                            setLlmProvider(savedLlm);
                        } else {
                            setLlmProvider(data.current_llm);
                        }
                    }
                })
                .catch(console.error);
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
            if (llmProvider) {
                localStorage.setItem('admin_selected_llm', llmProvider);
            }
        } catch { /* ignore */ }

        // 调用登录 API 设置 HttpOnly Cookie
        if (nextKey) {
            const success = await login(nextKey);
            // 登录成功后刷新页面，让 SSR 重新渲染管理员组件
            if (success) {
                window.location.reload();
                return;
            }
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
        clearKey,
        llmProvider,
        setLlmProvider,
        availableLLMs
    };
}
