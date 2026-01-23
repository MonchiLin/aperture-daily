/**
 * EchoList - 历史回响列表组件
 */
import { EchoItem } from './EchoItem';
import type { EchoItem as EchoItemType } from './types';

interface EchoListProps {
    echoes: EchoItemType[];
}

export function EchoList({ echoes }: EchoListProps) {
    if (!echoes || echoes.length === 0) return null;

    return (
        <div className="space-y-6">
            {echoes.slice(0, 3).map((echo, idx) => (
                <EchoItem key={idx} echo={echo} index={idx} />
            ))}
        </div>
    );
}
