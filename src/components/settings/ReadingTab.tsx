/**
 * ReadingTab - 阅读风格设置标签页
 *
 * 允许用户为不同的生成模式配置阅读风格。
 */
import { useStore } from '@nanostores/react';
import { BookOpen, Sparkles } from 'lucide-react';
import SegmentedControl from '../ui/SegmentedControl';
import {
    settingsStore,
    updateReadingStyle,
    type GenerationMode,
    type ReadingStyle,
} from '../../lib/store/settingsStore';

const STYLE_OPTIONS = [
    { id: 'default' as const, label: 'Default' },
    { id: 'impression' as const, label: 'Impression' },
];

interface StyleSelectorProps {
    mode: GenerationMode;
    value: ReadingStyle;
    layoutId: string;
}

function StyleSelector({ mode, value, layoutId }: StyleSelectorProps) {
    return (
        <SegmentedControl
            value={value}
            onChange={(style) => updateReadingStyle(mode, style)}
            options={STYLE_OPTIONS}
            layoutId={layoutId}
        />
    );
}

export default function ReadingTab() {
    const settings = useStore(settingsStore);

    // 兼容旧版本设置（没有 readingStyles 字段）
    const readingStyles = settings.readingStyles ?? {
        rss: 'default' as const,
        impression: 'impression' as const,
    };

    return (
        <div className="space-y-6">
            {/* RSS Mode */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <label className="text-sm font-bold text-stone-800 flex items-center gap-2">
                        <BookOpen size={14} className="text-stone-500" />
                        RSS Mode
                    </label>
                    <p className="text-xs text-stone-500 font-serif italic">
                        Reading style for daily news articles.
                    </p>
                </div>
                <StyleSelector
                    mode="rss"
                    value={readingStyles.rss}
                    layoutId="rss-style-pill"
                />
            </div>

            {/* Impression Mode */}
            <div className="flex items-center justify-between pt-4 border-t border-stone-100">
                <div className="space-y-0.5">
                    <label className="text-sm font-bold text-stone-800 flex items-center gap-2">
                        <Sparkles size={14} className="text-amber-500" />
                        Impression Mode
                    </label>
                    <p className="text-xs text-stone-500 font-serif italic">
                        Reading style for random vocabulary articles.
                    </p>
                </div>
                <StyleSelector
                    mode="impression"
                    value={readingStyles.impression}
                    layoutId="impression-style-pill"
                />
            </div>

            {/* Style Description */}
            <div className="pt-4 border-t border-stone-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400">
                    Style Comparison
                </h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-stone-50 rounded border border-stone-100">
                        <div className="font-bold text-stone-700 mb-1">Default</div>
                        <ul className="text-stone-500 space-y-0.5 font-serif italic">
                            <li>• Two-column layout with sidebar</li>
                            <li>• Margin Notes for vocabulary</li>
                            <li>• Historical Echoes on hover</li>
                        </ul>
                    </div>
                    <div className="p-3 bg-amber-50/50 rounded border border-amber-100">
                        <div className="font-bold text-amber-700 mb-1">Impression</div>
                        <ul className="text-stone-500 space-y-0.5 font-serif italic">
                            <li>• Single-column centered layout</li>
                            <li>• Click for word details popover</li>
                            <li>• Clean, distraction-free design</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
