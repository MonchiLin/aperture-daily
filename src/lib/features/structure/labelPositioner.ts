/**
 * Structure Label Positioner
 * 
 * Design: Labels appear directly above their target words and scroll with content.
 * Uses position: absolute relative to article container so labels move with page scroll.
 */

/**
 * Create and position labels for all active structure elements
 */
export function positionStructureLabels(container: HTMLElement): void {
    const structureSpans = container.querySelectorAll('[data-structure]:has(.structure-active)');
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
    }

    const labels: LabelData[] = [];

    // First pass: Create all labels positioned above their words
    structureSpans.forEach((span) => {
        const structureSpan = span as HTMLElement;
        const role = structureSpan.dataset.structure;
        if (!role) return;

        // Use getClientRects() to handle multiline spans.
        // getBoundingClientRect() returns a union box which is wrong for centering labels on multiline text.
        const rects = structureSpan.getClientRects();
        if (rects.length === 0) return;

        // Anchor to the first line's segment for a consistent editorial look
        const firstRect = rects[0]!;

        const label = document.createElement('span');
        label.className = 'structure-label';
        label.textContent = getLabelText(role);
        label.style.setProperty('--label-color', getLabelColor(role));

        // Ensure absolute positioning (overrides any CSS fixed/relative)
        label.style.position = 'absolute';
        label.style.visibility = 'hidden';
        container.appendChild(label);

        const labelRect = label.getBoundingClientRect();

        // Coordinate Conversion: Viewport -> Document -> Container-relative
        // containerRect is from getBoundingClientRect (viewport-relative)
        const relativeTop = firstRect.top - containerRect.top;
        const relativeLeft = firstRect.left - containerRect.left;

        // Position label centered above the first line segment
        const labelLeft = relativeLeft + (firstRect.width - labelRect.width) / 2;
        const baseTop = relativeTop - LABEL_OFFSET;

        label.style.left = `${Math.max(0, labelLeft)}px`;
        label.style.top = `${baseTop}px`;
        label.style.visibility = 'visible';

        labels.push({
            element: label,
            connector: null,
            spanRect: firstRect, // We use the first rect for all subsequent logic
            labelRect: label.getBoundingClientRect(),
            baseTop: baseTop,
            finalTop: baseTop,
            left: labelLeft,
            nudged: false
        });
    });

    // Sort by left position for collision detection
    labels.sort((a, b) => a.left - b.left);

    // Second pass: Detect and resolve collisions
    for (let i = 1; i < labels.length; i++) {
        const current = labels[i];

        for (let j = i - 1; j >= 0; j--) {
            const prev = labels[j];

            // Check horizontal overlap
            const currentRight = current.left + current.labelRect.width;
            const prevRight = prev.left + prev.labelRect.width;
            const hOverlap = !(currentRight + MIN_LABEL_GAP <= prev.left ||
                current.left >= prevRight + MIN_LABEL_GAP);

            // Check if they're at similar heights
            const sameLevel = Math.abs(current.finalTop - prev.finalTop) < NUDGE_HEIGHT;

            if (hOverlap && sameLevel) {
                // Nudge current label up
                current.finalTop = prev.finalTop - NUDGE_HEIGHT;
                current.nudged = true;
                current.element.style.top = `${current.finalTop}px`;
            }
        }
    }

    // Third pass: Add connectors for nudged labels
    labels.forEach((label) => {
        if (label.nudged) {
            const connector = document.createElement('div');
            connector.className = 'structure-connector';

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
