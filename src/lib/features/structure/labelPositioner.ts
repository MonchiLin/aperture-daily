/**
 * Structure Label Positioner (Rewrite v2)
 * 
 * Philosophy:
 * 1. Simplicity: Anchors labels firmly to the START of the structure (first line).
 * 2. Robustness: Uses physics-based stacking to resolve collisions, no matter how dense.
 * 3. Clarity: Outer structures stack ABOVE inner structures.
 */

import { type StructureRole, GRAMMAR_ROLES } from '../../structure/definitions';

const LABEL_BASE_OFFSET = 4; // px distance from text top
const HORIZONTAL_PADDING = 2; // Min gap between labels width-wise
const VERTICAL_SPACING = 2;   // Gap between stacked labels
const DEAD_ZONE_X = 10;       // X-distance threshold to consider "same position" for sorting

export function clearLabels(): void {
    document.querySelectorAll('.structure-label, .structure-connector').forEach(el => el.remove());
}

export function positionStructureLabels(container: HTMLElement): void {
    clearLabels();

    const containerRect = container.getBoundingClientRect();
    const spans = Array.from(container.querySelectorAll('[data-structure]:has(.structure-active)')) as HTMLElement[];

    if (spans.length === 0) return;

    // --- Step 1: Prepare Metric Objects ---
    const items = spans.map((span, index) => {
        const role = span.dataset.structure as StructureRole;
        const def = GRAMMAR_ROLES[role];
        if (def?.noLabel) return null;

        // Anchor Logic: Always target the FIRST visible line of the span.
        // This prevents labels from appearing in the middle of a paragraph for long structures.
        const rects = span.getClientRects();
        if (rects.length === 0) return null; // Hidden or collapsed
        const anchorRect = rects[0];

        // We anchor to the horizontal center of the first word/segment
        const anchorX = (anchorRect.left + anchorRect.width / 2) - containerRect.left;
        const anchorTop = anchorRect.top - containerRect.top;

        // Visual Props
        const text = def?.label || role.toUpperCase();
        const color = def?.color || '#333';
        const id = `st-lbl-${index}`;

        // Link spans for interaction
        span.dataset.labelId = id;

        return {
            id,
            span,
            text,
            color,
            anchorX,
            anchorTop,
            // Dynamic props
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            el: null as HTMLElement | null
        };
    }).filter(Boolean) as NonNullable<typeof items[0]>[];

    // --- Step 2: Measure Sizes (Batch DOM Write/Read) ---
    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'structure-label';
        el.innerText = item.text;
        el.style.setProperty('--label-color', item.color);
        el.dataset.id = item.id;
        // Hidden initially
        el.style.visibility = 'hidden';
        container.appendChild(el);
        item.el = el;
    });

    // Read sizes (triggers reflow once)
    items.forEach(item => {
        if (!item.el) return;
        const r = item.el.getBoundingClientRect();
        item.width = r.width;
        item.height = r.height;
    });

    // --- Step 3: Sorting & Stacking ---
    // Sort logic: 
    // Primary: X position (Left to Right)
    // Secondary: Length (Smallest to Largest) -> This ensures "Inner" tags sit lower, "Outer" tags stack higher.
    items.sort((a, b) => {
        const diffX = a.anchorX - b.anchorX;
        if (Math.abs(diffX) > DEAD_ZONE_X) return diffX;

        // If roughly same start, put shorter (inner) spans first
        return a.span.innerText.length - b.span.innerText.length;
    });

    // Placement loop
    const placedBoxes: { x: number, y: number, w: number, h: number }[] = [];

    items.forEach(item => {
        // Start position: Centered at anchorX, sitting right on top of the text
        let desiredX = item.anchorX - item.width / 2;
        let desiredY = item.anchorTop - item.height - LABEL_BASE_OFFSET;

        // Clamp Left
        if (desiredX < 0) desiredX = 0;

        // Collision Resolution (The Elevator Algorithm)
        // Keep moving UP until we don't hit anything
        // Limit iterations to prevent infinite loops in pathological cases
        let collision = true;
        let limit = 0;

        while (collision && limit < 50) {
            collision = false;
            for (const box of placedBoxes) {
                const overlap = !(
                    desiredX + item.width + HORIZONTAL_PADDING < box.x ||
                    desiredX > box.x + box.w + HORIZONTAL_PADDING ||
                    desiredY + item.height < box.y || // box is above me
                    desiredY > box.y + box.h          // box is below me
                );

                if (overlap) {
                    // Hit something! Jump above it.
                    desiredY = box.y - item.height - VERTICAL_SPACING;
                    collision = true;
                    // Restart check from new Y implies checking all boxes again? 
                    // Yes, technically logic dictates verifying new pos against everyone.
                    // But in a sorted list 'elevator' approach (iterating placedBoxes), 
                    // we usually just need to clear the highest obstacle at this X.
                    // Optimization: track 'skyline' at this X range.
                }
            }
            limit++;
        }

        item.x = desiredX;
        item.y = desiredY;
        placedBoxes.push({ x: item.x, y: item.y, w: item.width, h: item.height });
    });

    // --- Step 4: Finalize Render ---
    items.forEach(item => {
        if (!item.el) return;

        item.el.style.left = `${item.x}px`;
        item.el.style.top = `${item.y}px`;
        item.el.style.visibility = 'visible';

        // Draw Connector Line if label was lifted
        const labelBottom = item.y + item.height;
        // Connector logic: only if gap is significant (> 2px)
        const gap = item.anchorTop - labelBottom;

        if (gap > LABEL_BASE_OFFSET + 2) {
            const line = document.createElement('div');
            line.className = 'structure-connector';
            line.style.cssText = `
                position: absolute;
                left: ${item.x + item.width / 2}px;
                top: ${labelBottom}px;
                width: 1px;
                height: ${gap}px;
                background-color: ${item.color};
                opacity: 0.3;
                pointer-events: none;
            `;
            container.appendChild(line);
        }

        // --- Interaction ---
        // Simple Interaction: Hover Label -> Highlight Span
        const onEnter = () => {
            item.span.classList.add('st-hover');
            item.el?.classList.add('st-hover');
            // Fade others? Maybe keep it simple for now to reduce visual noise
        };
        const onLeave = () => {
            item.span.classList.remove('st-hover');
            item.el?.classList.remove('st-hover');
        };

        item.el.addEventListener('mouseenter', onEnter);
        item.el.addEventListener('mouseleave', onLeave);
        item.span.addEventListener('mouseenter', onEnter);
        item.span.addEventListener('mouseleave', onLeave);
    });
}
