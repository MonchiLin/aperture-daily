import { useState, useEffect, useCallback } from 'react';
import type { SetupStatus } from '../../components/onboarding/OnboardingDiegetic';
import { apiFetch } from '../api';

export function useSetupStatus() {
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const checkStatus = useCallback(async () => {
        setLoading(true);
        try {
            // Use apiFetch to automatically handle base URL (e.g. localhost:3000)
            const data = await apiFetch<SetupStatus>('/api/setup-status');
            setStatus(data);

            // If setup is complete, we can mark local storage (optional, for "First Time" logic)
            if (data.isSetup) {
                localStorage.setItem('app_has_onboarded', 'true');
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    return { status, loading, error, recheck: checkStatus };
}
