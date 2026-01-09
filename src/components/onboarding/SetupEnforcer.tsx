import { useEffect, useState } from 'react';
import { useSetupStatus } from '../../lib/hooks/useSetupStatus';
import OnboardingDiegetic from './OnboardingDiegetic';
import { AlertTriangle } from 'lucide-react';

export default function SetupEnforcer() {
    const { status, loading, recheck } = useSetupStatus();
    const [isOpen, setIsOpen] = useState(false);

    // Logic:
    // 1. If loading, do nothing (or show splash?)
    // 2. If !status.isSetup (issues), Force Open.
    // 3. If status.isSetup, check localStorage 'app_has_onboarded'. If not present, Open (Welcome Mode).
    // 4. If status.isSetup && 'app_has_onboarded', Show nothing (or Indicator).

    useEffect(() => {
        if (!status) return;

        if (!status.isSetup) {
            // Check if user has explicitly skipped the setup
            const hasSkipped = localStorage.getItem('setup_skipped');
            if (hasSkipped === 'true') {
                setIsOpen(false);
            } else {
                setIsOpen(true);
            }
        } else {
            // Check if user has seen onboarding
            const hasOnboarded = localStorage.getItem('app_has_onboarded');
            if (hasOnboarded !== 'true') {
                setIsOpen(true);
            } else {
                setIsOpen(false);
            }
        }
    }, [status]);

    const handleComplete = () => {
        setIsOpen(false);
        localStorage.setItem('app_has_onboarded', 'true');
    };

    const handleSkip = () => {
        setIsOpen(false);
        localStorage.setItem('setup_skipped', 'true');
    };

    if (loading || !status) return null;

    return (
        <>
            {/* 1. Global Warning Indicator (Only when issues exist but modal might be closed manually? No, Diegetic forces open usually) 
                Actually, Diegetic doesn't necessarily force open PERMANENTLY, but it should.
                Let's stick to the plan: If issues, show Diegetic overlay.
            */}

            {/* 2. The Setup/Onboarding Overlay */}
            {isOpen && (
                <div className="relative z-50">
                    <OnboardingDiegetic
                        status={status}
                        onRecheck={recheck}
                        onComplete={handleComplete}
                        onSkip={handleSkip}
                        loading={loading}
                    />
                </div>
            )}

            {/* 3. Minimized Status Indicator (Inline for Header) */}
            {!isOpen && !status.isSetup && (
                <div className="animate-pulse mr-2">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm hover:bg-red-700 transition-colors uppercase tracking-wider"
                    >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Config Error</span>
                    </button>
                </div>
            )}
        </>
    );
}
