/**
 * TriggerWord - Impression 风格的单词交互组件
 *
 * 点击时触发 WordPopover 弹窗显示单词详情。
 * 采用虚线下划线 + 橙色高亮的视觉风格。
 */
import { useRef } from 'react';
import { clsx } from 'clsx';

interface TriggerWordProps {
    /** 显示的文本 */
    children: string;
    /** 单词标识符（用于匹配词汇数据） */
    wordKey: string;
    /** 是否处于激活状态 */
    isActive: boolean;
    /** 点击回调，传递 wordKey 和元素位置 */
    onClick: (wordKey: string, rect: DOMRect) => void;
}

export function TriggerWord({
    children,
    wordKey,
    isActive,
    onClick,
}: TriggerWordProps) {
    const ref = useRef<HTMLSpanElement>(null);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (ref.current) {
            onClick(wordKey, ref.current.getBoundingClientRect());
        }
    };

    return (
        <span
            ref={ref}
            onClick={handleClick}
            className={clsx(
                'cursor-pointer transition-colors duration-200',
                'border-b-[1.5px] border-dotted',
                isActive
                    ? 'text-[#D9480F] border-[#D9480F]'
                    : 'text-inherit hover:text-[#D9480F] border-[#D9480F]/50'
            )}
        >
            {children}
        </span>
    );
}
