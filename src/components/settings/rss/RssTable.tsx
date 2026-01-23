/**
 * RssTable - RSS sources table component
 * 
 * Atomic Design: Organism
 * Displays the complete table of RSS sources with loading and empty states.
 */
import { RssTableRow } from './RssTableRow';
import type { NewsSource } from './useGlobalRssPanelLogic';

interface RssTableProps {
    sources: NewsSource[];
    loading: boolean;
    onDelete: (id: string) => void;
}

export function RssTable({ sources, loading, onDelete }: RssTableProps) {
    return (
        <div className="border border-stone-200 rounded-sm overflow-hidden bg-white">
            <table className="w-full text-left text-sm">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-medium uppercase tracking-wider text-[10px]">
                    <tr>
                        <th className="px-4 py-3">Source Name</th>
                        <th className="px-4 py-3">Feed URL</th>
                        <th className="px-4 py-3 w-20 text-center">Topics</th>
                        <th className="px-4 py-3 w-16 text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                    {loading ? (
                        <tr><td colSpan={4} className="p-6 text-center text-stone-400">Loading...</td></tr>
                    ) : sources.length === 0 ? (
                        <tr><td colSpan={4} className="p-6 text-center text-stone-400 italic">No sources found. Add one above or Import OPML.</td></tr>
                    ) : (
                        sources.map(source => (
                            <RssTableRow
                                key={source.id}
                                source={source}
                                onDelete={onDelete}
                            />
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}
