/**
 * PopoverContent - Popover 内容组件
 * 
 * 将深层嵌套的 Popover 内容提取为独立组件，降低 HistoricalEchoes 的复杂度。
 */
import { motion } from 'framer-motion';
import { DefinitionSection } from './DefinitionSection';
import { EchoHeader } from './EchoHeader';
import { EchoList } from './EchoList';
import { OverflowIndicator } from './OverflowIndicator';
import type { PopoverContentProps } from './types';

export function PopoverContent({ definition, echoes, showDefinition }: PopoverContentProps) {
    const hasDefinition = showDefinition && !!definition;
    const hasEchoes = echoes.length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 4, scale: 0.98, filter: 'blur(2px)' }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            className="relative bg-[#fffdf9]/95 backdrop-blur-xl border border-[#efe8d8] rounded-2xl shadow-[0_25px_60px_-12px_rgba(45,25,0,0.15),0_0_1px_rgba(0,0,0,0.1)] p-6 min-w-[340px] max-w-[420px] text-left"
        >
            {/* Definition Section */}
            {hasDefinition && <DefinitionSection definition={definition} />}

            {/* Header (Only show if we have echoes) */}
            {hasEchoes && <EchoHeader date={echoes[0]?.date} />}

            {/* Content List */}
            {hasEchoes && <EchoList echoes={echoes} />}

            {/* Overflow Indicator */}
            {hasEchoes && <OverflowIndicator count={echoes.length} />}
        </motion.div>
    );
}
