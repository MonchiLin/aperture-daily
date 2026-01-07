/**
 * 文章高亮处理器 - 核心逻辑抽离
 */

export interface SentenceMapping {
    start: number;
    end: number;
    id: number;
    text: string;
}

import { setActiveWord } from '../store/interactionStore';
import { UniversalTokenizer } from './tokenizer';

/**
 * 对指定的容器元素进行句子分段并标记 DOM
 */
export function tokenizeSentences(
    levelContainer: HTMLElement,
    targetWords: string[],
    wordsWithHistory: string[] = [],
    wordMatchConfigs?: { lemma: string; forms: string[] }[] // [Refactor] New Config
) {
    if (!levelContainer || levelContainer.dataset.processed === 'true') return;

    const startTime = performance.now();
    const blocks = Array.from(levelContainer.children).filter(el =>
        ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'LI', 'BLOCKQUOTE', 'DIV'].includes(el.tagName)
    );

    // Global Sentence ID counter to ensure uniqueness across paragraphs
    let globalSentenceIdCounter = 0;

    blocks.forEach((block) => {
        const ttsText = (block as HTMLElement).textContent || '';

        // Use UniversalTokenizer per block to get consistent segmentation
        const tokenizer = new UniversalTokenizer(ttsText);
        const segments = tokenizer.getSegments();

        const sentenceMap: SentenceMapping[] = segments.map((s) => ({
            start: s.rawOffsets.start,
            end: s.rawOffsets.end,
            id: globalSentenceIdCounter++,
            text: s.text
        }));

        let currentGlobalOffset = 0;
        const nodesToReplace: { oldNode: Node, fragment: DocumentFragment }[] = [];
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = node.textContent || '';
            const nodeLength = text.length;
            const nodeStart = currentGlobalOffset;

            const fragment = document.createDocumentFragment();
            let nodeCursor = 0;

            while (nodeCursor < nodeLength) {
                const absCursor = nodeStart + nodeCursor;
                const sent = sentenceMap.find(s => absCursor >= s.start && absCursor < s.end);

                if (!sent) {
                    const chunk = text.substring(nodeCursor);
                    fragment.appendChild(document.createTextNode(chunk));
                    nodeCursor += chunk.length;
                    continue;
                }

                const relativeEnd = Math.min(nodeLength, sent.end - nodeStart);
                const chunkText = text.substring(nodeCursor, relativeEnd);

                const span = document.createElement('span');
                span.className = 's-token transition-colors duration-300 rounded-sm';
                span.dataset.sid = sent.id.toString();
                span.dataset.s = sent.start.toString();

                // Process Target Words
                processTargetWords(span, chunkText, targetWords, wordsWithHistory, wordMatchConfigs);

                fragment.appendChild(span);
                nodeCursor = relativeEnd;
            }

            nodesToReplace.push({ oldNode: node, fragment });
            currentGlobalOffset += nodeLength;
        }

        nodesToReplace.forEach(({ oldNode, fragment }) => {
            if (oldNode.parentNode) {
                oldNode.parentNode.replaceChild(fragment, oldNode);
            }
        });
    });

    levelContainer.dataset.processed = 'true';
    levelContainer.dataset.processedType = 'sentence';
    console.log(`[HighlighterLogic] Processed in ${(performance.now() - startTime).toFixed(2)}ms.`);
}

/**
 * 在句子 span 中标记生词
 */
function processTargetWords(
    container: HTMLElement,
    text: string,
    targetWords: string[],
    wordsWithHistory: string[],
    wordMatchConfigs?: { lemma: string; forms: string[] }[]
) {
    let lastP = 0;
    const wordRegex = /([a-zA-Z0-9'-]+)/g;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
        const word = match[0];
        const idx = match.index;
        const lowercaseWord = word.toLowerCase();

        if (idx > lastP) {
            container.appendChild(document.createTextNode(text.substring(lastP, idx)));
        }

        // [Refactor] Prioritize Config Match -> Fallback to string array
        let matchedLemma: string | null = null;

        if (wordMatchConfigs) {
            const config = wordMatchConfigs.find(c => c.forms.includes(lowercaseWord));
            if (config) {
                matchedLemma = config.lemma;
            }
        } else if (targetWords.includes(lowercaseWord)) {
            matchedLemma = lowercaseWord;
        }

        if (matchedLemma) {
            const wSpan = document.createElement('span');
            wSpan.className = 'target-word';
            wSpan.textContent = word; // Display actual text (e.g., "ran")
            wSpan.dataset.word = matchedLemma; // Store lemma (e.g., "run")

            const hasHistory = wordsWithHistory.includes(matchedLemma.toLowerCase());
            if (hasHistory) {
                wSpan.dataset.hasHistory = "true";
                // console.log(`[Highlighter] Marked HISTORY for: ${matchedLemma}`);
            }

            // Interaction
            wSpan.addEventListener('mouseenter', () => {
                setActiveWord(matchedLemma);
            });
            wSpan.addEventListener('mouseleave', () => {
                setActiveWord(null);
            });

            wSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                // Speak the lemma or the word? Usually lemma is better for learning, but word matches text.
                // Let's speak the visible word for now, or maybe lemma?
                // User's request implies learning -> Lemma might be better if they want to know the root.
                // But for reading flow, reading the text is better.
                // Let's keep reading the text (word).
                const u = new SpeechSynthesisUtterance(word);
                u.lang = 'en-US';
                speechSynthesis.speak(u);
            });
            container.appendChild(wSpan);
        } else {
            container.appendChild(document.createTextNode(word));
        }
        lastP = idx + word.length;
    }

    if (lastP < text.length) {
        container.appendChild(document.createTextNode(text.substring(lastP)));
    }
}

/**
 * 查找当前播放位置对应的句子 ID
 */
export function findActiveSid(block: HTMLElement, charIndex: number): number {
    const tokens = Array.from(block.querySelectorAll('.s-token')) as HTMLElement[];
    const uniqueSentences = new Map<number, number>(); // sid -> start

    tokens.forEach(t => {
        const sid = parseInt(t.dataset.sid || '0');
        const s = parseInt(t.dataset.s || '0');
        if (!uniqueSentences.has(sid)) uniqueSentences.set(sid, s);
    });

    const sids = Array.from(uniqueSentences.keys()).sort((a, b) => a - b);
    for (let i = 0; i < sids.length; i++) {
        const sid = sids[i];
        const start = uniqueSentences.get(sid) || 0;
        const nextStart = (i < sids.length - 1) ? (uniqueSentences.get(sids[i + 1]) || 999999) : 999999;

        if (charIndex >= start && charIndex < nextStart) {
            return sid;
        }
    }
    return -1;
}
