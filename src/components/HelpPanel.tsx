import React, { useState } from 'react';
import Modal from './ui/Modal';
import { HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { RULE_LIST } from '../lib/features/syntax/SyntaxDefinitions';

export default function HelpPanel() {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<'legend' | 'guide'>('legend');

    // Group roles for display (Optional: or just use ROLE_LIST flat)
    // The previous hardcoded list had categories. 
    // We can map ROLE_LIST to the same structure or just use it flat.
    // Let's use ROLE_LIST directly but we might want to group them visually in the UI?
    // The UI loop (lines 95+) iterates `symbols`.
    // Let's map definitions to the shape expected by UI if different, or just use definitions.

    const symbols = RULE_LIST.map(def => ({
        key: def.label,
        name: def.name,
        desc: def.desc,
        example: def.example,
        target: def.target,
        color: def.color
    }));

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-2 py-1.5 border border-transparent hover:border-stone-300 hover:bg-stone-100 transition-all rounded-sm group text-stone-500 hover:text-stone-900"
                title="帮助与图例"
            >
                <HelpCircle className="w-4 h-4" />
            </button>

            <Modal
                title="阅读指南"
                open={open}
                onClose={() => setOpen(false)}
                width={700}
            >
                <div className="flex border-b border-stone-200 mb-6">
                    <button
                        onClick={() => setTab('legend')}
                        className={clsx(
                            "px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
                            tab === 'legend' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"
                        )}
                    >
                        语法图例
                    </button>
                    <button
                        onClick={() => setTab('guide')}
                        className={clsx(
                            "px-4 py-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors",
                            tab === 'guide' ? "border-stone-900 text-stone-900" : "border-transparent text-stone-400 hover:text-stone-600"
                        )}
                    >
                        交互指南
                    </button>
                </div>

                {tab === 'legend' ? (
                    <div className="space-y-4">
                        <p className="text-sm text-stone-600 font-serif italic mb-4">
                            我们的 AI 会分析句子结构，帮助你理解复杂的英语模式。在阅读时点击任意句子即可查看这些标签：
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {symbols.map(s => (
                                <div key={s.key} className="flex gap-4 p-3 border border-stone-100 bg-white shadow-sm rounded-sm">
                                    <div className="flex-shrink-0">
                                        <span
                                            className="inline-flex items-center justify-center w-8 h-8 rounded text-[10px] font-bold text-white shadow-sm"
                                            style={{ backgroundColor: s.color }}
                                        >
                                            {s.key}
                                        </span>
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="text-sm font-bold text-stone-900">{s.name}</h4>
                                        <p className="text-[11px] text-stone-500 mb-1 leading-tight">{s.desc}</p>
                                        <p className="text-[11px] font-serif italic text-stone-700">
                                            例子：{s.example.split(s.target).map((part, i, arr) => (
                                                <React.Fragment key={i}>
                                                    {part}
                                                    {i < arr.length - 1 && <span className="underline decoration-stone-300 decoration-wavy underline-offset-2 font-bold">{s.target}</span>}
                                                </React.Fragment>
                                            ))}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 py-2">
                        <section>
                            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-3 border-b border-stone-100 pb-1">句子结构分析</h3>
                            <p className="text-sm text-stone-600 leading-relaxed font-serif">
                                在阅读时点击任意句子，可以开启该句的 <strong className="text-stone-900">结构分析视图</strong>。这会高亮整个句子，并在上方生动的展示其语法成分标签。
                            </p>
                        </section>
                        <section>
                            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-3 border-b border-stone-100 pb-1">智能词汇辅助</h3>
                            <p className="text-sm text-stone-600 leading-relaxed font-serif">
                                将鼠标悬停在 <span className="underline decoration-dotted decoration-stone-400 underline-offset-4">带有下划线的单词</span> 上，即可查看其定义。动态视觉连接线会引导你查看侧边栏中的详细卡片。
                            </p>
                        </section>
                        <section className="bg-stone-50 p-4 rounded-sm border border-stone-200">
                            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-900 mb-3">快捷键</h3>
                            <div className="flex items-center gap-3">
                                <kbd className="px-2 py-1 bg-white border border-stone-300 rounded text-[10px] font-mono shadow-sm font-bold">ESC</kbd>
                                <span className="text-xs text-stone-500 font-serif">取消句子高亮或关闭当前对话框。</span>
                            </div>
                        </section>
                    </div>
                )}
            </Modal>
        </>
    );
}
