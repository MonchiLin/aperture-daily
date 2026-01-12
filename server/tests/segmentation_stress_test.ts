/**
 * Sentence Segmentation Stress Test
 * Compares: Native Intl.Segmenter vs Heuristic (from analyzer.ts)
 */

const cases = [
    // --- Target Cases (Should Merge) ---
    "A geologist named Jason W. Ricketts made an finding.",
    "George R. R. Martin wrote the book.",
    "Please call John F. Kennedy immediately.",

    // --- False Positive Candidates (Should NOT Merge) ---
    "I need Vitamin C. It is good for health.",
    "Option A. This is the first choice.",
    "He arrived at 5 p.m. Then he left.",
    "Look at Exhibit B. The evidence is clear.",
    "My name is T. I am a robot.",

    // --- Standard Cases (Control) ---
    "Hello World. This is a test.",
    "Mr. Smith is here.",
];

// --- 1. Native Intl.Segmenter (Baseline) ---
const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
function nativeSplit(text: string) {
    return Array.from(segmenter.segment(text)).map(s => s.segment.trim());
}

// --- 2. Heuristic (Same logic as in analyzer.ts) ---
const SENTENCE_STARTERS = new Set([
    'It', 'The', 'This', 'That', 'He', 'She', 'They', 'We', 'I',
    'But', 'And', 'Or', 'So', 'Then', 'If', 'When', 'As', 'However',
    'Meanwhile', 'Moreover', 'Furthermore', 'Therefore', 'Thus',
    'In', 'On', 'At', 'For', 'With', 'By', 'From', 'To', 'A', 'An'
]);

function heuristicSplit(text: string) {
    const segments = Array.from(segmenter.segment(text));
    const mergedSegments: { segment: string }[] = [];

    for (const seg of segments) {
        const last = mergedSegments[mergedSegments.length - 1];

        if (last && /[ ][A-Z]\.\s*$/.test(last.segment)) {
            const nextFirstWord = seg.segment.trim().split(/\s+/)[0] || '';
            const isSentenceStarter = SENTENCE_STARTERS.has(nextFirstWord);

            if (!isSentenceStarter) {
                last.segment += seg.segment;
                continue;
            }
        }
        mergedSegments.push({ segment: seg.segment });
    }
    return mergedSegments.map(s => s.segment.trim());
}

console.log("=== Segmentation Comparison: Native vs Heuristic ===\n");

cases.forEach((text, i) => {
    const native = nativeSplit(text);
    const heuristic = heuristicSplit(text);

    const merged = heuristic.length < native.length;

    console.log(`[Case ${i + 1}] "${text}"`);
    console.log(`   Native:    ${JSON.stringify(native)}`);
    console.log(`   Heuristic: ${JSON.stringify(heuristic)}${merged ? '  ✅ (Merged)' : ''}`);
    console.log("-".repeat(60));
});

