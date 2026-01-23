/**
 * RssTableRow - Single row component for RSS sources table
 * 
 * Atomic Design: Molecule
 * Displays a single RSS source with its associated topics and delete action.
 */
import { Popconfirm } from 'antd';
import { TrashIcon } from '@radix-ui/react-icons';
import { Tag } from '../../ui/Tag';
import { getStringColor } from '../../../lib/ui-utils';
import type { NewsSource } from './useGlobalRssPanelLogic';

interface RssTableRowProps {
    source: NewsSource;
    onDelete: (id: string) => void;
}

export function RssTableRow({ source, onDelete }: RssTableRowProps) {
    return (
        <tr className="group hover:bg-stone-50/50">
            <td className="px-4 py-3 font-medium text-stone-800">
                {source.name}
            </td>
            <td className="px-4 py-3 text-stone-500 font-mono text-xs truncate max-w-xs" title={source.url}>
                {source.url}
            </td>
            <td className="px-4 py-3">
                {(source.topics || []).length === 0 ? (
                    <span className="text-stone-300 italic text-xs">—</span>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {(source.topics || []).map(t => (
                            <Tag key={t.id} variant="solid" color={getStringColor(t.label)}>
                                {t.label}
                            </Tag>
                        ))}
                    </div>
                )}
            </td>
            <td className="px-4 py-3 text-right">
                <Popconfirm
                    title="Delete this feed?"
                    description="This will unbind it from all topics."
                    onConfirm={() => onDelete(source.id)}
                    okText="Yes"
                    cancelText="No"
                >
                    <button
                        className="p-1.5 hover:bg-red-50 text-stone-400 hover:text-red-600 rounded transition-colors"
                    >
                        <TrashIcon />
                    </button>
                </Popconfirm>
            </td>
        </tr>
    );
}
