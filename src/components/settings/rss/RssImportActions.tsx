/**
 * RssImportActions - Import buttons component
 * 
 * Atomic Design: Molecule
 * Provides UI for importing OPML files or URLs.
 */
import { UploadIcon } from '@radix-ui/react-icons';
import type { ChangeEvent } from 'react';

interface RssImportActionsProps {
    onImportFile: (e: ChangeEvent<HTMLInputElement>) => void;
    onImportUrl: () => void;
}

export function RssImportActions({ onImportFile, onImportUrl }: RssImportActionsProps) {
    return (
        <div className="flex items-center gap-2">
            <button
                onClick={onImportUrl}
                className="px-3 py-1.5 bg-white border border-stone-200 text-stone-500 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-stone-50 hover:text-stone-900 transition-colors shadow-sm"
            >
                Import from URL
            </button>
            <div>
                <input
                    type="file"
                    accept=".opml,.xml"
                    className="hidden"
                    id="opml-upload"
                    onChange={onImportFile}
                />
                <label
                    htmlFor="opml-upload"
                    title="Supports OPML exports from Feedly, Inoreader, etc."
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 text-stone-600 text-xs font-bold uppercase tracking-wider rounded-sm hover:bg-stone-50 hover:text-stone-900 cursor-pointer transition-colors shadow-sm"
                >
                    <UploadIcon /> Import File
                </label>
            </div>
        </div>
    );
}
