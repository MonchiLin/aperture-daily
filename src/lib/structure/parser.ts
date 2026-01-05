import { GRAMMAR_ROLES, type StructureRole } from './definitions';

// The basic building block of our render tree
export type RenderNode =
    | { type: 'text'; content: string }
    | { type: 'newline' } // Dedicated node for line breaks
    | { type: 'element'; role: StructureRole; children: RenderNode[] };

interface StructureItem {
    role: StructureRole;
    start: number; // Character offset start
    end: number;   // Character offset end
}

/**
 * StructureParser
 * 
 * Transforms raw text and structure offsets into a hierarchical Abstract Syntax Tree (AST).
 * This replaces the old string-injection approach.
 */
export class StructureParser {
    private text: string;
    private structures: StructureItem[];

    constructor(text: string, structures: StructureItem[]) {
        this.text = text;
        this.structures = this.normalizeStructures(structures);
    }

    /**
     * Main entry point to parse the text into an AST.
     */
    public parse(): RenderNode[] {
        // If no text, return empty
        if (!this.text) return [];

        // If no structure, return text as single node (with newline handling)
        if (this.structures.length === 0) {
            return this.parseTextWithNewlines(this.text);
        }

        // Build the tree recursively
        return this.buildTree(0, this.text.length, this.structures);
    }

    /**
     * Recursively builds nodes for a specific range of text.
     */
    private buildTree(
        rangeStart: number,
        rangeEnd: number,
        structuresInRange: StructureItem[]
    ): RenderNode[] {
        const nodes: RenderNode[] = [];
        let cursor = rangeStart;

        // Sort structures by start position first, then by priority (length/role)
        // We want to process the earliest occurring structure first.
        // If multiple start at the same pos, the one that ends later (outermost) should go first.
        const sorted = [...structuresInRange].sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            // Same start: longer one is parent (outer)
            return b.end - a.end;
        });

        // We only process 'top-level' structures in this range.
        // Nested ones will be handled by the recursive call.
        let i = 0;
        while (i < sorted.length && cursor < rangeEnd) {
            const current = sorted[i]!;

            // 1. Skip if this structure is completely outside current cursor (shouldn't happen with correct filtering)
            if (current.end <= cursor) {
                i++;
                continue;
            }

            // 2. Handle text BEFORE the structure starts
            if (current.start > cursor) {
                const textSegment = this.text.substring(cursor, current.start);
                nodes.push(...this.parseTextWithNewlines(textSegment));
                cursor = current.start;
            }

            // 3. Process the structure (Recursion)
            // Identify all children structures that are FULLY contained within this 'current' structure
            const childrenStructures: StructureItem[] = [];
            let j = i + 1;
            while (j < sorted.length) {
                const next = sorted[j]!;
                // If 'next' structure is fully inside 'current', it's a child.
                if (next.start >= current.start && next.end <= current.end) {
                    childrenStructures.push(next);
                }
                // Note: Overlapping structures (partial overlap) are theoretically impossible in valid syntax trees.
                // If they occur, we either ignore or treat as sibling, but for now we assume strict containment.
                j++;
            }

            // Build the children nodes for this element
            const children = this.buildTree(current.start, current.end, childrenStructures);

            nodes.push({
                type: 'element',
                role: current.role,
                children: children
            });

            // Advance cursor to end of this structure
            cursor = current.end;

            // Skip all structures we just processed as children
            // We need to advance 'i' past all the children we just consumed.
            // Since `sorted` is flattened, we can't just skip `childrenStructures.length`.
            // We need to find the next structure in `sorted` that starts >= cursor.
            i++;
            while (i < sorted.length && sorted[i]!.start < cursor) {
                i++;
            }
        }

        // 4. Handle remaining text after the last structure
        if (cursor < rangeEnd) {
            const remainder = this.text.substring(cursor, rangeEnd);
            nodes.push(...this.parseTextWithNewlines(remainder));
        }

        return nodes;
    }

    /**
     * Helper: Splits a raw string into Text and Newline nodes.
     */
    private parseTextWithNewlines(raw: string): RenderNode[] {
        if (!raw) return [];

        // Split by \n, keeping the delimiters? simpler to just regex match
        const parts = raw.split(/(\n)/g);
        const result: RenderNode[] = [];

        for (const part of parts) {
            if (part === '\n') {
                result.push({ type: 'newline' });
            } else if (part.length > 0) {
                result.push({ type: 'text', content: part });
            }
        }
        return result;
    }

    /**
     * Ensures structure data is clean and valid.
     */
    private normalizeStructures(raw: StructureItem[]): StructureItem[] {
        if (!Array.isArray(raw)) return [];
        // Filter out invalid ranges
        return raw.filter(s =>
            s.start >= 0 &&
            s.end > s.start &&
            s.end <= this.text.length &&
            GRAMMAR_ROLES[s.role] // Ensure valid role
        );
    }
}

/**
 * Utility: Splits a list of RenderNodes into blocks (paragraphs) based on newlines.
 * 
 * Strategy: 
 * - Top-level newlines are treated as block separators.
 * - Newlines inside 'element' nodes are preserved as-is (internal line breaks).
 */
export function splitASTIntoBlocks(nodes: RenderNode[]): RenderNode[][] {
    const blocks: RenderNode[][] = [];
    let currentBlock: RenderNode[] = [];

    for (const node of nodes) {
        if (node.type === 'newline') {
            // End of current block
            if (currentBlock.length > 0) {
                blocks.push(currentBlock);
                currentBlock = [];
            }
        } else {
            currentBlock.push(node);
        }
    }

    if (currentBlock.length > 0) {
        blocks.push(currentBlock);
    }

    return blocks;
}
