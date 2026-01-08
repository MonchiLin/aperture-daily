/**
 * 结构标签定位器 (Structure Label Positioner v3: Zero-Reflow & Functional)
 * 
 * 核心架构: "Measure -> Plan -> Paint" (测量 -> 规划 -> 绘制)
 * 这一架构严格分离了 DOM 的读取和写入操作，以防止 "Layout Thrashing" (布局抖动)。
 * 提供了一个清晰、函数式的堆叠算法实现。
 * 
 * 流程:
 * 1. Measure (读取): 批量读取所有 span 的位置信息。
 * 2. Create & Measure Labels (写入+读取): 创建标签元素并强制一次回流以测量其尺寸。
 * 3. Plan (逻辑计算): 在内存中计算所有标签的最终坐标 (Skyline 算法/堆叠逻辑)。
 * 4. Paint (写入): 批量应用最终坐标并渲染连接线。
 */
import { type AnalysisRole, GRAMMAR_RULES } from '../../analysis/GrammarRules';

// --- Configuration ---
const CONFIG = {
    OFFSET_Y: 4,     // Base distance above text
    PAD_X: 2,        // Horizontal gap between labels
    PAD_Y: 2,        // Vertical gap between stacked labels
    DEAD_ZONE: 10,   // Sort threshold for "same start position"
    CONNECTOR_MIN: 6 // Min length to draw connector line
};

interface LabelItem {
    // Input Data
    span: HTMLElement;
    text: string;
    color: string;
    anchorX: number;
    anchorY: number;
    // Measured Data
    width: number;
    height: number;
    // Computed Data
    x: number;
    y: number;
    hasConnector: boolean;
}

export function clearLabels(): void {
    document.querySelectorAll('.analysis-tag, .analysis-connector').forEach(el => el.remove());
}

export function layoutTags(container: HTMLElement): void {
    clearLabels();

    // 1. Selection & Filtering - Find analysis elements inside focused sentences
    const rawSpans = Array.from(container.querySelectorAll('.analysis-focus [data-analysis]')) as HTMLElement[];
    if (rawSpans.length === 0) return;

    // 2. Measure Context (Batch Read)
    const containerRect = container.getBoundingClientRect();
    const items = measureSpans(rawSpans, containerRect);
    if (items.length === 0) return;

    // 3. Create & Measure Labels (Batch Write -> Batch Read)
    const labelElements = createLabelElements(items, container);
    measureLabels(items, labelElements);

    // 4. Compute Layout (Pure Logic)
    computeLayout(items);

    // 5. Apply & Render (Batch Write)
    applyLayout(items, labelElements, container);
}

// --- Phase 1: Measure Spans ---
function measureSpans(spans: HTMLElement[], containerRect: DOMRect): LabelItem[] {
    return spans.map(span => {
        const role = span.dataset.analysis as AnalysisRole;
        const def = GRAMMAR_RULES[role];
        if (def?.noLabel) return null;

        // Anchor to first line
        const rects = span.getClientRects();
        if (!rects.length) return null;
        const anchorRect = rects[0];

        // Anchor Point: Top-Center of the first visual line
        return {
            span,
            text: def?.label || role.toUpperCase(),
            color: def?.color || '#333',
            anchorX: (anchorRect.left + anchorRect.width / 2) - containerRect.left,
            anchorY: anchorRect.top - containerRect.top,
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            hasConnector: false
        };
    }).filter(Boolean) as LabelItem[];
}

// --- Phase 2: Create & Measure Labels ---
function createLabelElements(items: LabelItem[], container: HTMLElement): HTMLElement[] {
    const elements = items.map(item => {
        const el = document.createElement('div');
        el.className = 'analysis-tag';
        el.textContent = item.text;
        el.style.setProperty('--tag-color', item.color);
        el.style.visibility = 'hidden'; // Hide during measurement
        return el;
    });
    // Single DOM Injection for all labels
    elements.forEach(el => container.appendChild(el));
    return elements;
}

function measureLabels(items: LabelItem[], elements: HTMLElement[]) {
    // Forced Reflow happens here ONCE for all elements
    elements.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        items[i].width = r.width;
        items[i].height = r.height;
    });
}

// --- Phase 3: Compute Layout (The "Skyline" Algorithm / 天际线算法) ---
function computeLayout(items: LabelItem[]) {
    // 排序策略: 从左到右, 然后从内到外 (短的在先)
    // 这样可以确保较小的标签先被放置，较大的标签包裹在它们上面或堆叠在上面。
    items.sort((a, b) => {
        const diffX = a.anchorX - b.anchorX;
        if (Math.abs(diffX) > CONFIG.DEAD_ZONE) return diffX;
        return a.span.innerText.length - b.span.innerText.length;
    });

    const placed: { x: number, y: number, w: number, h: number }[] = [];

    for (const item of items) {
        // Initial Ideal Position: Centered above anchor
        item.x = Math.max(0, item.anchorX - item.width / 2);
        item.y = item.anchorY - item.height - CONFIG.OFFSET_Y;

        // Collision Resolution: Stack upwards
        let collision = true;
        let attempts = 0;

        while (collision && attempts++ < 50) {
            collision = false;
            for (const box of placed) {
                if (isOverlapping(item, box)) {
                    // Overlap detected: Move item strictly above the colliding box
                    item.y = box.y - item.height - CONFIG.PAD_Y;
                    collision = true;
                }
            }
        }

        // Determine if connector line is needed
        const bottom = item.y + item.height;
        item.hasConnector = (item.anchorY - bottom) > CONFIG.CONNECTOR_MIN;

        placed.push({ x: item.x, y: item.y, w: item.width, h: item.height });
    }
}

function isOverlapping(item: LabelItem, box: { x: number, y: number, w: number, h: number }): boolean {
    return !(
        item.x + item.width + CONFIG.PAD_X < box.x ||
        item.x > box.x + box.w + CONFIG.PAD_X ||
        item.y + item.height < box.y ||
        item.y > box.y + box.h
    );
}

// --- Phase 4: Apply ---
function applyLayout(items: LabelItem[], elements: HTMLElement[], container: HTMLElement) {
    const connectorFragment = document.createDocumentFragment();

    items.forEach((item, i) => {
        const el = elements[i];

        // Apply computed positions
        el.style.left = `${item.x}px`;
        el.style.top = `${item.y}px`;
        el.style.visibility = 'visible';

        // Add Connector if needed
        if (item.hasConnector) {
            const line = document.createElement('div');
            line.className = 'analysis-connector';
            const h = item.anchorY - (item.y + item.height);
            line.style.cssText = `
                position: absolute;
                left: ${item.x + item.width / 2}px;
                top: ${item.y + item.height}px;
                width: 1px;
                height: ${h}px;
                background-color: ${item.color};
                opacity: 0.3;
                pointer-events: none;
            `;
            line.style.setProperty('--tag-color', item.color); // For other CSS hooks
            connectorFragment.appendChild(line);
        }
    });

    // Batch append all connectors
    container.appendChild(connectorFragment);
}
