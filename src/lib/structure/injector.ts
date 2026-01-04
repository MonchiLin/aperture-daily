/**
 * Injects Structure X-Ray Standoff Tags into original HTML using DOM manipulation.
 * 
 * 将语法结构数据（来自 LLM Stage 4）注入到文章 HTML 中。
 * 使用 Cheerio 进行 DOM 操作，确保不会破坏 HTML 结构。
 */

import * as cheerio from 'cheerio';

export type StructureData = Array<{
    start: number;
    end: number;
    role: 's' | 'v' | 'o' | 'rc' | 'pp' | 'pas' | 'con';
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

    // 3. Create Char Map with roles
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

    // 4. Apply Tags (直接使用偏移量，不做修正)
    for (const item of structure) {
        for (let i = Math.max(0, item.start); i < Math.min(item.end, charMap.length); i++) {
            charMap[i]!.roles.add(item.role);
        }
    }

    // 5. Reconstruct Nodes
    const nodesToUpdate = new Map<any, CharInfo[]>();
    for (const c of charMap) {
        if (!nodesToUpdate.has(c.refNode)) {
            nodesToUpdate.set(c.refNode, []);
        }
        nodesToUpdate.get(c.refNode)?.push(c);
    }

    for (const [originalNode, chars] of nodesToUpdate) {
        let replacementHtml = '';
        let currentRoles: string = '___none___';
        let currentBuffer = '';

        const flush = () => {
            if (!currentBuffer) return;

            if (currentRoles === '___none___') {
                replacementHtml += currentBuffer;
            } else {
                const roleList = currentRoles.split('|').filter(r => r !== 'undefined');

                // Priority Order: Outer -> Inner
                const priority = ['rc', 'pas', 'con', 'pp', 's', 'v', 'o'];

                roleList.sort((a, b) => {
                    const idxA = priority.indexOf(a) === -1 ? 99 : priority.indexOf(a);
                    const idxB = priority.indexOf(b) === -1 ? 99 : priority.indexOf(b);
                    return idxA - idxB;
                });

                let fragment = currentBuffer;

                // Iterate from right (Inner) to left (Outer)
                for (let i = roleList.length - 1; i >= 0; i--) {
                    const r = roleList[i];
                    fragment = `<span data-structure="${r}">` + fragment + `</span>`;
                }

                replacementHtml += fragment;
            }

            currentBuffer = '';
        };

        for (const c of chars) {
            const signature = Array.from(c.roles).sort().join('|') || '___none___';

            if (signature !== currentRoles) {
                flush();
                currentRoles = signature;
            }
            currentBuffer += c.char;
        }
        flush();

        $(originalNode).replaceWith(replacementHtml);
    }

    return $.html();
}
