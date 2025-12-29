/**
 * 高亮管理器 - React Island
 * 
 * 独立的高亮功能组件，延迟加载。
 * 负责：
 * 1. 预处理文章文本：将文本按句子分段 (Sentence Tokenization)
 * 2. 坐标对齐：使用 innerText (TTS标准) 计算坐标
 * 3. 标记目标生词 (Target Words)
 * 4. 朗读时同步高亮当前句子
 * 
 * Update: Sentence-Level Highlighting using Intl.Segmenter
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { audioState } from '../lib/store/audioStore';

interface HighlightManagerProps {
    articleId: string;
    targetWords: string[];
}



export default function HighlightManager({ articleId, targetWords }: HighlightManagerProps) {
    const [currentLevel, setCurrentLevel] = useState(1);

    const playbackActiveSidRef = useRef<number | null>(null);

    const { charIndex, currentIndex, isPlaying, wordAlignments } = useStore(audioState);

    // 监听难度切换
    useEffect(() => {
        const handleLevelChange = (e: CustomEvent) => {
            const level = e.detail?.level;
            if (level) {
                console.log('[HighlightManager] Level changed to:', level);
                setCurrentLevel(level);
            }
        };

        window.addEventListener('level-change' as any, handleLevelChange);

        // 初始读取
        const saved = localStorage.getItem('luma-words_preferred_level');
        if (saved) setCurrentLevel(parseInt(saved) || 1);

        return () => window.removeEventListener('level-change' as any, handleLevelChange);
    }, []);

    // 句子分词核心逻辑
    useEffect(() => {
        const levelContainer = document.querySelector(`.article-level[data-level="${currentLevel}"]`) as HTMLElement;

        if (!levelContainer || levelContainer.dataset.processed === 'true' || levelContainer.dataset.processedType === 'sentence') {
            return;
        }

        console.log(`[HighlightManager] Initializing SENTENCE tokenization for Level ${currentLevel}`);
        const startTime = performance.now();

        const blocks = Array.from(levelContainer.children).filter(el =>
            ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'LI', 'BLOCKQUOTE', 'DIV'].includes(el.tagName)
        );

        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

        blocks.forEach((block, idx) => {
            const ttsText = (block as HTMLElement).innerText || '';
            const rawSentences = Array.from(segmenter.segment(ttsText));

            // Map: [{ start, end, id }]
            const sentenceMap = rawSentences.map((s, i) => ({
                start: s.index,
                end: s.index + s.segment.length,
                id: i,
                text: s.segment
            }));

            let currentGlobalOffset = 0;
            const nodesToReplace: { oldNode: Node, fragment: DocumentFragment }[] = [];

            // 必须使用 TreeWalker 来正确处理嵌套标签 (如 <b>, <a>)
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);

            while (walker.nextNode()) {
                const node = walker.currentNode;
                const text = node.textContent || '';
                const nodeLength = text.length;
                const nodeStart = currentGlobalOffset;
                const nodeEnd = currentGlobalOffset + nodeLength;

                const fragment = document.createDocumentFragment();

                // 查找当前节点涉及的所有句子
                // 一个 TextNode 可能横跨多个句子，也可能完全在一个句子内
                let nodeCursor = 0; // relative to text

                while (nodeCursor < nodeLength) {
                    const absCursor = nodeStart + nodeCursor;

                    // 找到当前 Cursor 所属的句子
                    const sent = sentenceMap.find(s => absCursor >= s.start && absCursor < s.end);

                    if (!sent) {
                        // 理论上不应该发生，或者是尾部空白
                        const chunk = text.substring(nodeCursor);
                        fragment.appendChild(document.createTextNode(chunk));
                        nodeCursor += chunk.length;
                        continue;
                    }

                    // 确定当前片段在 TextNode 内的结束位置
                    // 它是：句子结束位置 vs TextNode 结束位置 的较小值
                    const relativeEnd = Math.min(nodeLength, sent.end - nodeStart);
                    const chunkText = text.substring(nodeCursor, relativeEnd);

                    // 创建句子 Token
                    const span = document.createElement('span');
                    span.className = 's-token transition-colors duration-300 rounded-sm'; // 句子容器
                    span.dataset.sid = sent.id.toString();
                    span.dataset.s = sent.start.toString(); // 句子的全局起点

                    // --- 只要在句子内部，就可以处理 Target Words ---
                    // 这里我们简单地用 Regex 再次处理 chunkText 里的生词
                    // 注意：这里可能会切断生词吗？极小概率，生词通常不会跨越句子边界。

                    let lastP = 0;
                    const wordRegex = /([a-zA-Z0-9'-]+)/g;
                    let match;

                    while ((match = wordRegex.exec(chunkText)) !== null) {
                        const word = match[0];
                        const idx = match.index;

                        if (idx > lastP) {
                            span.appendChild(document.createTextNode(chunkText.substring(lastP, idx)));
                        }

                        if (targetWords.includes(word.toLowerCase())) {
                            const wSpan = document.createElement('span');
                            wSpan.className = 'target-word cursor-pointer border-b-2 border-dotted border-orange-500 text-orange-600 font-semibold hover:bg-orange-100';
                            wSpan.textContent = word;
                            wSpan.addEventListener('click', (e) => {
                                e.stopPropagation(); // 防止冒泡导致其他交互问题
                                const u = new SpeechSynthesisUtterance(word);
                                u.lang = 'en-US';
                                speechSynthesis.speak(u);
                            });
                            span.appendChild(wSpan);
                        } else {
                            span.appendChild(document.createTextNode(word));
                        }
                        lastP = idx + word.length;
                    }

                    if (lastP < chunkText.length) {
                        span.appendChild(document.createTextNode(chunkText.substring(lastP)));
                    }
                    // ---------------------------------------------

                    fragment.appendChild(span);
                    nodeCursor = relativeEnd;
                }

                nodesToReplace.push({ oldNode: node, fragment });
                currentGlobalOffset += nodeLength;
            }

            // 批量替换
            nodesToReplace.forEach(({ oldNode, fragment }) => {
                if (oldNode.parentNode) {
                    oldNode.parentNode.replaceChild(fragment, oldNode);
                }
            });
        });

        levelContainer.dataset.processed = 'true';
        levelContainer.dataset.processedType = 'sentence';
        console.log(`[HighlightManager] Level ${currentLevel} SENTENCE tokenized in ${(performance.now() - startTime).toFixed(2)}ms.`);

    }, [targetWords, articleId, currentLevel]);

    // 朗读高亮同步 (Sentence Level)
    useEffect(() => {
        // Clear old highlight
        if (playbackActiveSidRef.current !== null) {
            const oldSid = playbackActiveSidRef.current;
            const levelContainer = document.querySelector(`.article-level[data-level="${currentLevel}"]`);
            if (levelContainer) {
                const oldTokens = levelContainer.querySelectorAll(`.s-token[data-sid="${oldSid}"]`);
                oldTokens.forEach(t => t.classList.remove('bg-orange-100/50', 'shadow-sm', 'decoration-clone'));
                // decoration-clone is useful for box-decoration-break: clone if needed
            }
            playbackActiveSidRef.current = null;
        }

        if (!isPlaying || charIndex === -1) return;

        const levelContainer = document.querySelector(`.article-level[data-level="${currentLevel}"]`);
        if (!levelContainer) return;

        // 这里有个 trick: 我们需要找到 block，再找 sid
        // 或者因为我们现在是 Global SID per block?
        // Wait, the SID we generated (0, 1, 2) is relative to the BLOCK.
        // So we still need `currentIndex` (Block Index) first.

        const blocks = Array.from(levelContainer.children).filter(el =>
            ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'LI', 'BLOCKQUOTE', 'DIV'].includes(el.tagName)
        );
        const block = blocks[currentIndex] as HTMLElement;
        if (!block) return;

        // Find the active sentence within this block
        const tokens = Array.from(block.querySelectorAll('.s-token')) as HTMLElement[];

        // Find SID
        // The token has data-s (start) of the sentence.
        // We find the sentence where token.s <= charIndex < next_token.s

        // Get unique sentences (since one sentence might map to multiple s-tokens)
        const uniqueSentences = new Map<number, number>(); // sid -> start
        tokens.forEach(t => {
            const sid = parseInt(t.dataset.sid || '0');
            const s = parseInt(t.dataset.s || '0');
            if (!uniqueSentences.has(sid)) uniqueSentences.set(sid, s);
        });

        let targetSid = -1;
        // Iterate maps is usually insertion order, but safely sorting keys is better
        const sids = Array.from(uniqueSentences.keys()).sort((a, b) => a - b);

        for (let i = 0; i < sids.length; i++) {
            const sid = sids[i];
            const start = uniqueSentences.get(sid) || 0;
            const nextStart = (i < sids.length - 1) ? (uniqueSentences.get(sids[i + 1]) || 99999) : 99999;

            if (charIndex >= start && charIndex < nextStart) {
                targetSid = sid;
                break;
            }
        }

        if (targetSid !== -1) {
            const targetTokens = block.querySelectorAll(`.s-token[data-sid="${targetSid}"]`);
            targetTokens.forEach(t => t.classList.add('bg-orange-100/50', 'shadow-sm'));
            playbackActiveSidRef.current = targetSid;
        }

    }, [charIndex, currentIndex, isPlaying, currentLevel]);

    return null;
}
