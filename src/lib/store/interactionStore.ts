import { map } from 'nanostores';


export type EchoData = {
    snippet: string;
    articleTitle: string;
    articleId: string;
    date: string;
    timeAgo: string;
}[] | null;

export type InteractionState = {
    activeWord: string | null;  // currently hovered word (lowercase)
    currentLevel: number;       // current Difficulty Level (1, 2, 3)
    echoData: EchoData;         // semantic memory context
    hoveredSentenceIndex: number | null; // synced hover state from audio playlist
}

// [New] For O(1) hover performance
export type InteractionEvent = {
    word: string;
    rect: { top: number; left: number; width: number; height: number };
    id: string; // unique event id to force updates
} | null;

export const activeInteraction = map<{ current: InteractionEvent }>({ current: null });

// [Data-Driven] The Registry
// Holds the memory data for the current article.
// Not exported as an atom to avoid react re-renders on init, 
// but used internally to derive state.
let echoesRegistry: Record<string, any> = {};

export const initEchoes = (echoes: Record<string, any>) => {
    echoesRegistry = echoes || {};
};

export const setInteraction = (word: string, rect: { top: number; left: number; width: number; height: number }) => {
    const normalized = word.toLowerCase();

    // 1. Update the Event (for UI positioning)
    activeInteraction.setKey('current', {
        word: normalized,
        rect,
        id: crypto.randomUUID()
    });

    // 2. Derive Application State (for VisualTether, WordSidebar, etc.)
    // This allows components to just "react" to store changes without knowing about the event details.

    // Only update if changed to avoid thrashing
    const currentStore = interactionStore.get();
    if (currentStore.activeWord !== normalized) {
        interactionStore.setKey('activeWord', normalized);

        // Look up valid memory data
        const mems = echoesRegistry[normalized];
        if (mems && Array.isArray(mems) && mems.length > 0) {
            interactionStore.setKey('echoData', mems.map(m => ({
                snippet: m.snippet,
                articleTitle: m.articleTitle,
                articleId: m.articleId,
                date: m.date,
                timeAgo: m.timeAgo || m.date
            })));
        } else {
            interactionStore.setKey('echoData', null);
        }
    }
};

export const clearInteraction = () => {
    activeInteraction.setKey('current', null);
    // Optional: Clear activeWord too? 
    // Usually yes for hover.
    interactionStore.setKey('activeWord', null);
    // interactionStore.setKey('echoData', null); // Optional, maybe keep for fade out?
};

// ... keep existing echoData for compat during migration
// eventually we might merge echoData lookup into the component or a derived atom

export const interactionStore = map<InteractionState>({
    activeWord: null,
    currentLevel: 1,
    echoData: null,
    hoveredSentenceIndex: null
});

// Helper actions
export const setHoveredSentence = (index: number | null) => {
    interactionStore.setKey('hoveredSentenceIndex', index);
};

export const setActiveWord = (word: string | null) => {
    const normalized = word ? word.toLowerCase() : null;
    interactionStore.setKey('activeWord', normalized);

    if (normalized) {
        // [Data-Driven] Also look up memory data for sidebar interactions
        const mems = echoesRegistry[normalized];
        if (mems && Array.isArray(mems) && mems.length > 0) {
            interactionStore.setKey('echoData', mems.map(m => ({
                snippet: m.snippet,
                articleTitle: m.articleTitle,
                articleId: m.articleId,
                date: m.date,
                timeAgo: m.timeAgo || m.date
            })));
        } else {
            interactionStore.setKey('echoData', null);
        }
    } else {
        interactionStore.setKey('echoData', null);
    }
};

export const setLevel = (level: number) => {
    interactionStore.setKey('currentLevel', level);
};


