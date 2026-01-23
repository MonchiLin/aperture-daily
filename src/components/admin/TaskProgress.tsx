

// Locally defining the shape we care about to avoid importing deep server types into client if not necessary,
// or we can try to import if the build system supports it.
// Given strict separation is often good, but here we just need specific fields.
interface Checkpoint {
    stage: 'search_selection' | 'draft' | 'conversion' | 'grammar_analysis';
}

type TaskProgressProps = {
    contextJson: string | null;
    status: string;
};

export default function TaskProgress({ contextJson, status }: TaskProgressProps) {
    if (status !== 'running') return null;

    let stageText = 'Stage 1/4: 搜索选词';
    try {
        const cp = contextJson
            ? (typeof contextJson === 'string' ? JSON.parse(contextJson) : contextJson) as Checkpoint
            : null;

        if (cp?.stage === 'search_selection') stageText = 'Stage 2/4: 撰写草稿';
        else if (cp?.stage === 'draft') stageText = 'Stage 3/4: 格式转换';
        else if (cp?.stage === 'conversion' || cp?.stage === 'grammar_analysis') stageText = 'Stage 4/4: 语法透视';
    } catch {
        // Ignore parse errors
    }

    return (
        <span className="text-orange-500 font-serif italic font-medium lowercase tracking-normal bg-orange-50 px-1.5 py-0.5 rounded-sm">
            {stageText}
        </span>
    );
}
