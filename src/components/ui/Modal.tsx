import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    width?: number | string;
    minHeight?: number | string;
};

export default function Modal({ open, onClose, title, children, width = 600, minHeight }: ModalProps) {
    const [mounted, setMounted] = React.useState(false);

    useEffect(() => {
        setMounted(true);
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-stone-900/20 backdrop-blur-sm"
                    />

                    {/* Dialog */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto outline-none"
                        style={{ width }}
                    >
                        <div
                            className="relative bg-[#F3F2EE] border border-stone-300 shadow-xl p-6 md:p-8"
                            style={{ minHeight }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6 border-b border-stone-200 pb-4">
                                <div className="text-xl font-serif font-bold text-stone-900">
                                    {title}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="text-stone-400 hover:text-stone-900 transition-colors p-1"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Content */}
                            <div>
                                {children}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
