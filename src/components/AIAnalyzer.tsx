/**
 * AIAnalyzer - 选词 AI 分析触发器
 * 
 * 监听用户选择文本，提供"Ask AI"按钮来分析选中的内容。
 * Refactor: Using Ant Design Popover for better positioning.
 */
import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Sparkles } from 'lucide-react';
import { Popover, Button, ConfigProvider, theme } from 'antd';

const LazyAIChatSidebar = lazy(() => import('./AIChatSidebar').then((m) => ({ default: m.AIChatSidebar })));

interface AIAnalyzerProps {
    articleContent: string;
}

interface SelectionInfo {
    text: string;
    rect: DOMRect;
}

export default function AIAnalyzer({ articleContent }: AIAnalyzerProps) {
    const [selection, setSelection] = useState<SelectionInfo | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [analyzeSelection, setAnalyzeSelection] = useState<{ selectionText: string; article: string } | null>(null);

    // We don't need a button ref for manually detecting clicks anymore 
    // because Popover handles outside clicks reasonably well, 
    // but we do need to handle clearing selection on document mousedown if not clicking the popover.

    useEffect(() => {
        const handleMouseUp = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                // Don't clear immediately if we messed up, but usually native selection clearing happens naturally.
                // Actually, if we click "Ask AI", selection might be lost.
                // Let's set selection only if valid.
                setSelection(null); // Clear previous first
                return;
            }

            const text = sel.toString().trim();
            if (text.length < 2 || text.length > 800) {
                // Relaxed limits slightly
                return;
            }

            // 检查选择是否在文章内容区域
            const articleEl = document.getElementById('article-content');
            if (!articleEl) return;

            const range = sel.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;

            if (!articleEl.contains(element)) return;

            const rect = range.getBoundingClientRect();
            // Store absolute coordinates to survive scrolling if needed, 
            // but fixed position anchor is better with ClientRect.
            setSelection({ text, rect });
        };

        const handleMouseDown = (e: MouseEvent) => {
            // Check if clicking inside the popover or button
            // Antd popover renders in a portal, so checking `e.target` against a ref inside component might fail
            // if we don't handle it carefully.
            // However, Antd handles "click outside" to close popover.
            // The main issue is: local selection state vs UI.

            // If we click anywhere else, we generally want to close the popover.
            // But checking `.ant-popover` presence is a bit hacky.
            // Let's rely on `window.getSelection()` logic primarily. 
            // Most clicks clear selection natively.

            // We'll trust `handleMouseUp` to clear selection if `window.getSelection()` becomes empty.
            // But we add a small delay check? No.

            // Actually, if user clicks "Ask AI", the selection persists until action.
            // If user clicks away, selection clears.

            // Simple approach: On mousedown, if targeting not part of our UI, we assume selection might clear.
            const target = e.target as HTMLElement;
            if (target.closest('.ant-popover') || target.closest('.ai-trigger-anchor')) {
                return;
            }
            // 不要在这里 setSelection(null)，因为可能只是开始一个新的选区拖拽
        };

        const handleSelectionChange = () => {
            // If selection is cleared by browser, we should hide UI
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) {
                setSelection(null);
            }
        };

        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('mousedown', handleMouseDown); // Maybe optional
        document.addEventListener('selectionchange', handleSelectionChange);

        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('selectionchange', handleSelectionChange);
        };
    }, []);

    const handleAskAI = () => {
        if (!selection) return;

        setAnalyzeSelection({
            selectionText: selection.text,
            article: articleContent
        });
        setChatOpen(true);
        // Do NOT clear selection here immediately, or maybe do?
        // User might want to see what they selected while chat opens.
        // But usually we clear or keep. Let's clear UI but keep selection?
        setSelection(null);
        window.getSelection()?.removeAllRanges();
    };

    return (
        <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
            {/* Invisible Anchor for Popover */}
            {selection && (
                <div
                    className="ai-trigger-anchor"
                    style={{
                        position: 'fixed', // Use fixed to match getBoundingClientRect
                        left: selection.rect.left,
                        top: selection.rect.top,
                        width: selection.rect.width,
                        height: selection.rect.height,
                        zIndex: 40, // Below Popover
                        pointerEvents: 'none', // Let clicks pass through to text if needed? No, logic is tricky. 
                        // If pointer-events is none, we can't click it. But Popover attaches to it.
                    }}
                >
                    <Popover
                        open={true}
                        content={
                            <Button
                                type="primary"
                                shape="round"
                                icon={<Sparkles size={14} />}
                                onClick={handleAskAI}
                                style={{
                                    background: 'linear-gradient(to right, #f97316, #d97706)',
                                    border: 'none',
                                    fontWeight: 600,
                                    boxShadow: '0 4px 6px -1px rgb(249 115 22 / 0.3)'
                                }}
                            >
                                Ask AI
                            </Button>
                        }
                        placement="top"
                        arrow={false}
                        destroyTooltipOnHide
                        overlayInnerStyle={{ padding: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
                        // Force z-index high
                        zIndex={1000}
                    >
                        {/* Anchor point */}
                        <div style={{ width: '100%', height: '100%' }} />
                    </Popover>
                </div>
            )}

            {/* AI Chat Sidebar */}
            {chatOpen && (
                <Suspense fallback={null}>
                    <LazyAIChatSidebar
                        isOpen={chatOpen}
                        onClose={() => setChatOpen(false)}
                        analyzeSelection={analyzeSelection}
                    />
                </Suspense>
            )}
        </ConfigProvider>
    );
}
