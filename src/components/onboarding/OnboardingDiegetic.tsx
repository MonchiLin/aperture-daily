import {
    RefreshCw,
    Database,
    Bot,
    Key,
    ArrowRight,
    AlertTriangle
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export type SetupStatus = {
    isSetup: boolean;
    missing: string[];
    provider: 'gemini' | 'openai' | 'claude' | null;
    dbStatus: 'ok' | 'error' | 'checking';
};

interface OnboardingDiegeticProps {
    status: SetupStatus;
    onRecheck: () => void;
    onComplete?: () => void;
    onSkip?: () => void;
    loading?: boolean;
}

export default function OnboardingDiegetic({
    status,
    onRecheck,
    onComplete,
    onSkip,
    loading = false
}: OnboardingDiegeticProps) {
    const hasIssues = !status.isSetup;

    // Derived states for narrative
    const headline = hasIssues ? "THE PRESSES HAVE STOPPED" : "BREAKING NEWS: SYSTEM ONLINE";
    const subhead = hasIssues
        ? "Editors report a critical failure in the newsroom's infrastructure. Production halted indefinitely."
        : "The editorial engine has established a stable connection to the world's archives.";

    return (
        <div className="fixed inset-0 z-50 bg-[#F3F2EE] text-stone-900 overflow-y-auto font-serif flex items-center justify-center">
            {/* Background Texture */}
            <div className="absolute inset-0 opacity-50 pointer-events-none"
                style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/cream-paper.png')` }}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="max-w-6xl w-full min-h-screen md:min-h-[80vh] bg-[#FAFAF8] shadow-2xl relative border-t-4 border-stone-900 md:my-8 flex flex-col"
            >
                {/* 1. Header mimics the real app header */}
                <header className="border-b-2 border-stone-900 p-6 flex items-end justify-between bg-[#F3F2EE]">
                    <div>
                        <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none font-serif">
                            Aperture<br />Daily<span className="text-red-600">.</span>
                        </h1>
                    </div>
                    <div className="text-right font-mono text-xs md:text-sm tracking-widest uppercase text-stone-500 mb-1">
                        {hasIssues ? (
                            <span className="flex items-center gap-2 text-red-700 font-bold">
                                <AlertTriangle className="w-4 h-4" />
                                Edition #000: ERROR
                            </span>
                        ) : (
                            <span>Vol. 1 &bull; System Ready</span>
                        )}
                    </div>
                </header>

                {/* 2. Main Content Grid */}
                <div className="flex-grow grid grid-cols-1 md:grid-cols-12">

                    {/* Left Column: The "Broken" Story */}
                    <div className="col-span-1 md:col-span-8 p-6 md:p-12 border-b md:border-b-0 md:border-r border-stone-200 bg-white">
                        <div className="mb-12">
                            <span className={clsx(
                                "inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-widest mb-4",
                                hasIssues ? "bg-red-600 text-white" : "bg-stone-900 text-white"
                            )}>
                                {hasIssues ? "Status Report" : "Editorial"}
                            </span>
                            <h2 className={clsx(
                                "text-4xl md:text-5xl font-bold leading-[1.1] mb-6 transition-colors font-serif",
                                hasIssues ? "text-red-900 italic" : "text-stone-900"
                            )}>
                                {headline}
                            </h2>
                            <p className="text-xl md:text-2xl text-stone-600 font-medium leading-relaxed italic border-l-4 border-stone-300 pl-6">
                                {subhead}
                            </p>
                        </div>

                        {/* The "Redacted" Body Text */}
                        <div className="space-y-6 font-serif text-stone-400 select-none relative max-w-2xl">
                            {hasIssues ? (
                                <RedactedArticle />
                            ) : (
                                <RealArticle />
                            )}
                        </div>
                    </div>

                    {/* Right Column: The "Editor's Desk" (Controls) */}
                    <div className="col-span-1 md:col-span-4 bg-[#F8F7F4] p-6 md:p-8 flex flex-col">
                        <div className="sticky top-8 space-y-8 flex-grow">
                            <div>
                                <h3 className="font-sans font-bold text-xs uppercase tracking-[0.2em] text-stone-400 mb-6 border-b border-stone-200 pb-2">
                                    {hasIssues ? "Required Actions" : "Next Steps"}
                                </h3>

                                <div className="space-y-4">
                                    {hasIssues ? (
                                        <>
                                            <StatusCheck
                                                label="Database Link"
                                                status={status.dbStatus === 'ok' ? 'ok' : 'err'}
                                                icon={Database}
                                            />
                                            <StatusCheck
                                                label="Neural Provider"
                                                status={status.provider ? 'ok' : 'err'}
                                                icon={Bot}
                                            />
                                            <StatusCheck
                                                label="Access Key"
                                                status={status.missing.some(k => k.includes('KEY')) ? 'err' : 'ok'}
                                                icon={Key}
                                            />
                                        </>
                                    ) : (
                                        <div className="p-4 bg-green-50 border border-green-100 rounded text-green-800 text-sm italic font-serif">
                                            All systems nominal. The press is ready to run.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-8 border-t border-stone-200 mt-auto">
                                {hasIssues ? (
                                    <div className="space-y-4">
                                        <p className="font-sans text-xs text-stone-500 leading-relaxed">
                                            Configure environment variables to resolve infrastructure issues.
                                        </p>
                                        <button
                                            onClick={onRecheck}
                                            disabled={loading}
                                            className="w-full py-4 bg-stone-900 text-white font-sans font-bold text-sm uppercase tracking-wider hover:bg-red-700 transition-colors flex items-center justify-center gap-2 group shadow-lg"
                                        >
                                            <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                                            <span>Retry Connection</span>
                                        </button>

                                        <button
                                            onClick={onSkip}
                                            className="w-full py-3 mt-2 text-stone-500 font-sans font-bold text-[10px] uppercase tracking-wider hover:text-red-600 transition-colors flex items-center justify-center gap-2 group border border-dashed border-stone-300 hover:border-red-300 rounded"
                                        >
                                            <AlertTriangle className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                            <span className="group-hover:underline decoration-red-300 underline-offset-4">Access Anyway (Emergency Override)</span>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={onComplete}
                                        className="w-full py-4 bg-stone-900 text-white font-sans font-bold text-sm uppercase tracking-wider hover:bg-stone-800 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg"
                                    >
                                        <span>Print Daily Edition</span>
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </motion.div>
        </div>
    );
}

// Visual component for "Redacted" text blocks
function RedactedArticle() {
    return (
        <div className="space-y-3 opacity-50 grayscale mix-blend-multiply">
            {/* Mimic paragraphs with redacted blocks */}
            <RedactedLine width="90%" />
            <RedactedLine width="95%" />
            <RedactedLine width="85%" />
            <div className="h-4" />
            <RedactedLine width="92%" />
            <RedactedLine width="88%" />
            <RedactedLine width="40%" />
            <div className="h-4" />
            <RedactedLine width="98%" />
            <RedactedLine width="94%" />

            <div className="absolute inset-0 flex items-center justify-center pt-12">
                <div className="bg-stone-100/90 backdrop-blur-sm p-4 border border-stone-300 shadow-lg rotate-[-2deg] max-w-xs text-center transform hover:scale-105 transition-transform cursor-help">
                    <p className="font-sans text-xs font-bold text-red-600 uppercase tracking-widest border-2 border-red-600 px-3 py-1 mb-2 inline-block">
                        Content Missing
                    </p>
                    <p className="font-serif text-sm text-stone-600 italic">
                        "The story cannot be told without the ink of data."
                    </p>
                </div>
            </div>
        </div>
    );
}

function RedactedLine({ width }: { width: string }) {
    return (
        <div className="h-3 bg-stone-300 rounded-sm" style={{ width }} />
    );
}

function RealArticle() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="prose prose-stone prose-lg"
        >
            <p>
                The automated curation engine has successfully initialized.
                Aperture Daily is now ready to process the latest global events,
                synthesizing them into a cohesive narrative structure for your review.
            </p>
            <p>
                Please proceed to the main dashboard to begin your daily reading session.
            </p>
        </motion.div>
    );
}

function StatusCheck({ label, status, icon: Icon }: { label: string, status: 'ok' | 'err', icon: any }) {
    const isOk = status === 'ok';
    return (
        <div className={clsx(
            "flex items-center justify-between p-4 border-b transition-colors",
            isOk ? "border-stone-100 text-stone-400" : "border-red-100 bg-red-50 text-red-900 rounded-lg"
        )}>
            <div className="flex items-center gap-3">
                <Icon className={clsx("w-4 h-4", isOk ? "opacity-50" : "opacity-100")} />
                <span className="font-sans text-xs font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className={clsx(
                "w-2.5 h-2.5 rounded-full ring-2 ring-offset-2 ring-offset-[#F8F7F4]",
                isOk ? "bg-stone-300 ring-stone-200" : "bg-red-500 ring-red-200 animate-pulse"
            )} />
        </div>
    );
}
