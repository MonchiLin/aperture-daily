/**
 * Structure Label Positioner
 * 
 * Design: Labels appear directly above their target words and scroll with content.
 * Uses position: absolute relative to article container so labels move with page scroll.
 */

/**
 * Create and position labels for all active structure elements
 */
// Helper to detect if element A contains element B
function contains(parent: Element, child: Element): boolean {
    return parent !== child && parent.contains(child);
}

export function positionStructureLabels(container: HTMLElement): void {
    const structureSpans = Array.from(container.querySelectorAll('[data-structure]:has(.structure-active)'));
    if (structureSpans.length === 0) return;

    clearLabels();

    // Ensure container has relative positioning for absolute children
    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === 'static') {
        container.style.position = 'relative';
    }

    const containerRect = container.getBoundingClientRect();

    const LABEL_OFFSET = 18; // Base distance above word (px)
    const NUDGE_HEIGHT = 14; // How much to nudge up on collision (px)
    const MIN_LABEL_GAP = 4; // Minimum horizontal gap between labels (px)

    interface LabelData {
        element: HTMLElement;
        connector: HTMLElement | null;
        spanRect: DOMRect;
        labelRect: DOMRect;
        baseTop: number;
        finalTop: number;
        left: number;
        nudged: boolean;
        depth: number;
        parentId: string | null;
    }

    const labels: LabelData[] = [];
    const spanMap = new Map<HTMLElement, { id: string, label: HTMLElement, depth: number, parent: HTMLElement | null }>();

    // 1. Assign IDs and detect nesting
    structureSpans.forEach((span, index) => {
        const id = `st-uid-${index}-${Math.random().toString(36).substr(2, 5)}`;
        // Check depth: is this span inside another structure span?
        let parent: HTMLElement | null = null;
        let depth = 0;

        // Find closest parent structure span
        for (const other of structureSpans) {
            if (other !== span && contains(other, span)) {
                // If we found a parent, check if it's closer than the previous found parent
                if (!parent || contains(parent, other)) {
                    parent = other as HTMLElement;
                }
            }
        }

        if (parent) depth = 1; // Simplified: 0 = root, 1 = nested

        span.setAttribute('data-st-id', id);
        spanMap.set(span as HTMLElement, { id, label: null!, depth, parent });
    });

    // 2. Create Labels
    structureSpans.forEach((span) => {
        const structureSpan = span as HTMLElement;
        const role = structureSpan.dataset.structure;
        if (!role) return;

        const info = spanMap.get(structureSpan)!;
        const rects = structureSpan.getClientRects();
        if (rects.length === 0) return;
        const firstRect = rects[0]!;

        const label = document.createElement('span');
        label.className = `structure-label st-depth-${info.depth}`;
        label.textContent = getLabelText(role);
        label.style.setProperty('--label-color', getLabelColor(role));
        label.dataset.forId = info.id;

        // Initial visibility state based on depth
        // Depth 0: Visible
        // Depth 1: Hidden (opacity 0, translated)
        // Ensure absolute positioning (overrides any CSS fixed/relative)
        label.style.position = 'absolute';

        container.appendChild(label);
        info.label = label; // Link back

        const labelRect = label.getBoundingClientRect();
        const relativeTop = firstRect.top - containerRect.top;
        const relativeLeft = firstRect.left - containerRect.left;
        const labelLeft = relativeLeft + (firstRect.width - labelRect.width) / 2;
        const baseTop = relativeTop - LABEL_OFFSET;

        label.style.left = `${Math.max(0, labelLeft)}px`;
        label.style.top = `${baseTop}px`;

        // Push to labels array for collision detection (only for depth 0 mostly, but we process all)
        labels.push({
            element: label,
            connector: null,
            spanRect: firstRect,
            labelRect: label.getBoundingClientRect(),
            baseTop: baseTop,
            finalTop: baseTop,
            left: labelLeft,
            nudged: false,
            depth: info.depth,
            parentId: info.parent ? spanMap.get(info.parent)?.id || null : null
        });

        // Interactive Logic:
        // - Depth 0 (Parent): Hover -> Fade Self, Show Children
        // - Depth 1 (Child/Dot): Hover -> Fade Parent, Show Children (Self + Siblings)

        const myChildren = Array.from(spanMap.values()).filter(i => i.parent === span);
        const hasChildren = myChildren.length > 0;

        if (info.depth === 0 && hasChildren) {
            span.style.cursor = 'pointer';
        }

        const handleEnter = () => {
            if (info.depth === 0 && hasChildren) {
                label.classList.add('st-fade-out');
                myChildren.forEach(c => c.label.classList.add('st-fade-in'));
            } else if (info.depth === 1 && info.parent) {
                const pInfo = spanMap.get(info.parent);
                if (pInfo) {
                    pInfo.label.classList.add('st-fade-out');
                    // Show all siblings (children of my parent)
                    const siblings = Array.from(spanMap.values()).filter(i => i.parent === info.parent);
                    siblings.forEach(s => s.label.classList.add('st-fade-in'));
                }
            }
        };

        const handleLeave = () => {
            if (info.depth === 0 && hasChildren) {
                label.classList.remove('st-fade-out');
                myChildren.forEach(c => c.label.classList.remove('st-fade-in'));
            } else if (info.depth === 1 && info.parent) {
                const pInfo = spanMap.get(info.parent);
                if (pInfo) {
                    pInfo.label.classList.remove('st-fade-out');
                    const siblings = Array.from(spanMap.values()).filter(i => i.parent === info.parent);
                    siblings.forEach(s => s.label.classList.remove('st-fade-in'));
                }
            }
        };

        span.addEventListener('mouseenter', handleEnter);
        span.addEventListener('mouseleave', handleLeave);
        // Also bind to label (important for interacting with Dot)
        label.addEventListener('mouseenter', handleEnter);
        label.addEventListener('mouseleave', handleLeave);
    });

    // 4. Collision Detection (Only for visible depth-0 labels usually, but let's run for all to be safe)
    labels.sort((a, b) => a.left - b.left);
    for (let i = 1; i < labels.length; i++) {
        const current = labels[i];
        // We only collision detect labels at the same depth to avoid weird jumps between layers
        // Or we might want separate layers. For now, let's treat them as one plane but be careful.
        // Actually, if a depth-1 label collides with a depth-0 label, it might look weird if we shift it permanently.
        // Let's only nudge labels of the same depth.

        for (let j = i - 1; j >= 0; j--) {
            const prev = labels[j];
            if (current.depth !== prev.depth) continue;

            const currentRight = current.left + current.labelRect.width;
            const prevRight = prev.left + prev.labelRect.width;
            const hOverlap = !(currentRight + MIN_LABEL_GAP <= prev.left || current.left >= prevRight + MIN_LABEL_GAP);
            const sameLevel = Math.abs(current.finalTop - prev.finalTop) < NUDGE_HEIGHT;

            if (hOverlap && sameLevel) {
                current.finalTop = prev.finalTop - NUDGE_HEIGHT;
                current.nudged = true;
                current.element.style.top = `${current.finalTop}px`;
            }
        }
    }

    // Connectors
    labels.forEach((label) => {
        if (label.nudged) {
            const connector = document.createElement('div');
            // Add depth class to connector too so it hides/shows with label
            connector.className = `structure-connector st-depth-${label.depth}`;
            // ... (rest of connector logic)
            const labelCenterX = label.left + label.labelRect.width / 2;
            const connectorTop = label.finalTop + label.labelRect.height;
            const connectorHeight = label.baseTop - label.finalTop - 2;

            connector.style.cssText = `
                position: absolute;
                left: ${labelCenterX}px;
                top: ${connectorTop}px;
                width: 1px;
                height: ${Math.max(0, connectorHeight)}px;
                background: var(--label-color, #64748b);
                opacity: 0.4;
            `;
            connector.style.setProperty('--label-color', label.element.style.getPropertyValue('--label-color'));
            container.appendChild(connector);
            label.connector = connector;

            // Link connector visibility to label
            if (label.depth === 1) {
                // Initially hidden logic handled by CSS via class
            }
        }
    });
}

/**
 * Clear all dynamically created labels and connectors
 */
export function clearLabels(): void {
    document.querySelectorAll('.structure-label, .structure-connector').forEach(el => el.remove());
}

/**
 * Get display text for label
 */
function getLabelText(role: string): string {
    const map: Record<string, string> = {
        // Core
        's': 'S', 'subject': 'S',
        'v': 'V', 'verb': 'V',
        'o': 'O', 'object': 'O',
        'io': 'IO', 'indirect-object': 'IO',
        'cmp': 'CMP', 'complement': 'CMP',
        // Clauses & Phrases
        'rc': 'RC', 'rel-clause': 'RC',
        'pp': 'PP', 'prep-phrase': 'PP',
        'adv': 'ADV', 'adverbial': 'ADV',
        'app': 'APP', 'appositive': 'APP',
        // Voice & Connectives
        'pas': 'PAS', 'passive': 'PAS',
        'con': 'CON', 'connective': 'CON',
        // Non-finite
        'inf': 'INF', 'infinitive': 'INF',
        'ger': 'GER', 'gerund': 'GER',
        'ptc': 'PTC', 'participle': 'PTC'
    };
    return map[role] || role.toUpperCase();
}

/**
 * Get color for label
 */
function getLabelColor(role: string): string {
    const map: Record<string, string> = {
        // Core - same as HelpPanel colors
        's': '#1e3a8a', 'subject': '#1e3a8a',
        'v': '#991b1b', 'verb': '#991b1b',
        'o': '#065f46', 'object': '#065f46',
        'io': '#047857', 'indirect-object': '#047857',
        'cmp': '#7c3aed', 'complement': '#7c3aed',
        // Clauses & Phrases
        'rc': '#475569', 'rel-clause': '#475569',
        'pp': '#64748b', 'prep-phrase': '#64748b',
        'adv': '#0369a1', 'adverbial': '#0369a1',
        'app': '#0891b2', 'appositive': '#0891b2',
        // Voice & Connectives
        'pas': '#c2410c', 'passive': '#c2410c',
        'con': '#92400e', 'connective': '#92400e',
        // Non-finite
        'inf': '#be185d', 'infinitive': '#be185d',
        'ger': '#9d174d', 'gerund': '#9d174d',
        'ptc': '#831843', 'participle': '#831843'
    };
    return map[role] || '#1e293b';
}
