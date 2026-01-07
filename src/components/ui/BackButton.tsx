import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
    href: string;
    label?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({ href, label = "Back" }) => {
    return (
        <motion.a
            href={href}
            className="inline-flex items-center gap-1.5 text-slate-900/60 hover:text-slate-900 transition-colors mr-4 group px-2 py-1 -ml-2 rounded-md hover:bg-black/5"
            whileHover="hover"
            initial="initial"
            whileTap={{ scale: 0.95 }}
        >
            <motion.span
                variants={{
                    initial: { x: 0 },
                    hover: { x: -3 }
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
                <ArrowLeft className="w-3.5 h-3.5" />
            </motion.span>
            <span className="font-bold tracking-widest uppercase text-[10px]">{label}</span>
        </motion.a>
    );
};
