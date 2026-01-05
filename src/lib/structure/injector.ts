/**
 * Injects Structure X-Ray Standoff Tags into original HTML using DOM manipulation.
 * 
 * 将语法结构数据（来自 LLM Stage 4）注入到文章 HTML 中。
 * 使用 Cheerio 进行 DOM 操作，确保不会破坏 HTML 结构。
 */

import * as cheerio from 'cheerio';

export type StructureRole = 's' | 'v' | 'o' | 'io' | 'cmp' | 'rc' | 'pp' | 'adv' | 'app' | 'pas' | 'con' | 'inf' | 'ger' | 'ptc';

export type StructureData = Array<{
    start: number;
    end: number;
    role: StructureRole;
    extract?: string;
}>;

export function injectStructureSpans(htmlContent: string, structure: StructureData): string {
    if (!structure || structure.length === 0) return htmlContent;
    if (!htmlContent) return '';

    // 1. Load HTML into DOM
    const $ = cheerio.load(htmlContent, { xmlMode: false }, false);

    // 2. Build Text Map (Plain Text -> DOM Nodes)
    interface TextNodeRef {
        node: any;
        startIndex: number;
        endIndex: number;
        text: string;
    }

    const textNodes: TextNodeRef[] = [];
    let fullPlainText = '';

    function traverse(node: any) {
        if (node.type === 'text') {
            const text = node.data || '';
            if (text.length > 0) {
                textNodes.push({
                    node: node,
                    startIndex: fullPlainText.length,
                    endIndex: fullPlainText.length + text.length,
                    text: text
                });
                fullPlainText += text;
            }
        } else if (node.children && node.children.length > 0) {
            node.children.forEach(traverse);
        }
    }

    $.root().contents().each((_, el) => traverse(el));

    // Sort structure by start position
    structure.sort((a, b) => a.start - b.start);

    // 3. Create Char Map with roles (Global)
    // We use this to reliably map global offsets to per-node local offsets, handling multi-node spans.
    type CharInfo = {
        char: string;
        refNode: any;
        roles: Set<string>;
    };

    const charMap: CharInfo[] = [];
    for (const ref of textNodes) {
        for (let i = 0; i < ref.text.length; i++) {
            charMap.push({
                char: ref.text[i]!,
                refNode: ref.node,
                roles: new Set()
            });
        }
    }

    // 4. Apply Tags (Global Mapping)
    for (const item of structure) {
        for (let i = Math.max(0, item.start); i < Math.min(item.end, charMap.length); i++) {
            charMap[i]!.roles.add(item.role);
        }
    }

    // 5. Reconstruct Nodes with Nested Spans
    const nodesToUpdate = new Map<any, CharInfo[]>();
    for (const c of charMap) {
        if (!nodesToUpdate.has(c.refNode)) {
            nodesToUpdate.set(c.refNode, []);
        }
        nodesToUpdate.get(c.refNode)?.push(c);
    }

    // Priority for nesting (Lower index = Higher priority/Outer)
    // Generally Scope > Core > Modifier > Particle
    const rolePriority = ['rc', 's', 'v', 'o', 'io', 'cmp', 'pp', 'adv', 'app', 'pas', 'con', 'inf', 'ger', 'ptc'];

    const getRolePriority = (r: string) => {
        const idx = rolePriority.indexOf(r);
        return idx === -1 ? 999 : idx;
    };

    for (const [originalNode, chars] of nodesToUpdate) {
        if (chars.length === 0) continue;

        // 5a. Extract Local Ranges from Char Roles
        // Convert the per-character sets back into intervals [start, end)
        const ranges: { role: string; start: number; end: number; }[] = [];
        const activeRoles = new Map<string, number>(); // role -> start index

        for (let i = 0; i < chars.length; i++) {
            const currentRoles = chars[i].roles;
            // End roles not in current set
            for (const [role, start] of activeRoles) {
                if (!currentRoles.has(role)) {
                    ranges.push({ role, start, end: i });
                    activeRoles.delete(role);
                }
            }
            // Start new roles
            for (const role of currentRoles) {
                if (!activeRoles.has(role)) {
                    activeRoles.set(role, i);
                }
            }
        }
        // Close remaining
        for (const [role, start] of activeRoles) {
            ranges.push({ role, start, end: chars.length });
        }

        // 5b. Stack Reconciliation Algorithm
        // Create atomic segments (intervals where the set of active ranges is constant)
        const boundaries = new Set<number>([0, chars.length]);
        ranges.forEach(r => { boundaries.add(r.start); boundaries.add(r.end); });
        const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

        let htmlBuffer = '';
        let currentStack: string[] = []; // Roles currently open

        for (let i = 0; i < sortedBoundaries.length - 1; i++) {
            const start = sortedBoundaries[i];
            const end = sortedBoundaries[i + 1];

            // Find all roles active in this segment [start, end)
            // A role is active if it covers this whole segment (i.e. r.start <= start && r.end >= end)
            const activeInRange = ranges.filter(r => r.start <= start && r.end >= end);

            // Sort active roles to define hierarchy for this segment
            // 1. Longer duration (global length) should be outer? 
            //    Yes, but we only have local length here. 'ranges' has local length.
            //    Let's rely on local length + priority.
            // 2. Priority list.
            activeInRange.sort((a, b) => {
                const lenA = a.end - a.start;
                const lenB = b.end - b.start;
                if (lenA !== lenB) return lenB - lenA; // Longer first
                return getRolePriority(a.role) - getRolePriority(b.role);
            });

            const nextStack = activeInRange.map(r => r.role);

            // Reconcile currentStack vs nextStack
            // Find common prefix
            let prefixLen = 0;
            while (prefixLen < currentStack.length && prefixLen < nextStack.length) {
                if (currentStack[prefixLen] === nextStack[prefixLen]) {
                    prefixLen++;
                } else {
                    break;
                }
            }

            // Close roles that are no longer in stack (or order changed)
            // Reverse order (LIFO)
            for (let j = currentStack.length - 1; j >= prefixLen; j--) {
                htmlBuffer += '</span>';
            }

            // Open new roles
            for (let j = prefixLen; j < nextStack.length; j++) {
                htmlBuffer += `<span data-structure="${nextStack[j]}">`;
            }

            // Append Text Content
            const segmentText = chars.slice(start, end).map(c => c.char).join('');
            htmlBuffer += segmentText;

            currentStack = nextStack;
        }

        // Close remaining stack
        for (let j = currentStack.length - 1; j >= 0; j--) {
            htmlBuffer += '</span>';
        }

        $(originalNode).replaceWith(htmlBuffer);
    }

    return $.html();
}
