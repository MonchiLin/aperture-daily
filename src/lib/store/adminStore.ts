import { atom, onMount } from 'nanostores';
import { apiFetch } from '../api';

const ADMIN_KEY_STORAGE = 'aperture-daily_admin_key';

export const isAdminStore = atom<boolean>(false);

// Action: Verify and set admin status
export async function verifyAndSetAdmin(key: string | null) {
    if (!key) {
        isAdminStore.set(false);
        return false;
    }

    try {
        await apiFetch('/api/auth/check', { token: key });
        isAdminStore.set(true);
        return true;
    } catch {
        isAdminStore.set(false);
        return false;
    }
}

// Initial hydration and cross-tab sync
onMount(isAdminStore, () => {
    if (typeof window === 'undefined') return;

    const checkStatus = async () => {
        const key = localStorage.getItem(ADMIN_KEY_STORAGE);
        await verifyAndSetAdmin(key);
    };

    // Run on initial mount
    checkStatus();

    // Listen for storage changes (cross-tab sync)
    const handleStorage = (e: StorageEvent) => {
        if (e.key === ADMIN_KEY_STORAGE) {
            checkStatus();
        }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
});
