/**
 * useSettings Hook (前端配置状态机)
 * 
 * 核心功能：
 * 1. 状态聚合：统一管理 Admin Key, Voice Preference, LLM Selection 等分散的配置。
 * 2. 双向同步：
 *    - 初始化时：API -> LocalStorage -> State
 *    - 保存时：State -> LocalStorage & API (Cookie) -> Reload
 * 3. SSR 兼容：Admin Key 通过 HttpOnly Cookie 传输，确保服务器端也能验证身份 (Layout.astro 需要)。
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { isAdminStore, login } from '../../lib/store/adminStore';
import { setVoice } from '../../lib/store/audioStore';

import { apiFetch } from '../../lib/api';

export type SettingsTab = 'general' | 'audio' | 'profiles' | 'topics';

export function useSettings() {
    const [adminKey, setAdminKey] = useState('');
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [voice, setVoiceSettings] = useState('en-US-GuyNeural');
    const [tab, setTab] = useState<SettingsTab>('general');

    // LLM 设置
    const [availableLLMs, setAvailableLLMs] = useState<string[]>([]);
    const [llmProvider, setLlmProvider] = useState<string>('');

    const isAdmin = useStore(isAdminStore);

    const hasKey = useMemo(() => adminKey.trim().length > 0, [adminKey]);

    useEffect(() => {
        try {
            const storedVoice = localStorage.getItem('upword_voice_preference');
            if (storedVoice) setVoiceSettings(storedVoice);

            // 获取 LLM 配置并与本地存储同步
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

    // 保存设置并登录 (Login Action)
    async function save() {
        const nextKey = adminKey.trim();

        // 1. Client-Side Persistence: 立即保存非敏感偏好到 localStorage，
        // 这样刷新页面后 UI 能迅速恢复状态 (Optimistic UI)。
        try {
            localStorage.setItem('upword_voice_preference', voice);
            setVoice(voice);
            if (llmProvider) {
                localStorage.setItem('admin_selected_llm', llmProvider);
            }
        } catch { /* ignore */ }

        // 2. Server-Side Session: 通过 POST /login 交换 HttpOnly Cookie。
        // 这是最关键的一步，只有 Cookie 设置成功，所有 SSR 页面和受保护 API 才能访问。
        if (nextKey) {
            const success = await login(nextKey);

            // 3. Hard Reload: 登录成功后强制刷新。
            // 为什么？因为 Astro 是 MPA (Multi-Page App)。
            // 仅仅客户端状态改变不足以让服务器重新渲染受保护的 Layout 组件。
            // 必须刷新页面，让新的 Cookie 随请求发送，从而在服务器端通过校验。
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
