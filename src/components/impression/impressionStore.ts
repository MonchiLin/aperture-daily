import { atom } from 'nanostores';

export interface InsightData {
    term: string;
    phonetic?: string;
    definition: string;
    etymology?: string;
    context?: string; // The sentence context or cultural context
    type: 'vocabulary' | 'concept' | 'person' | 'location';
}

// Mock Data Database
export const MOCK_INSIGHTS: Record<string, InsightData> = {
    "ephemeral": {
        term: "Ephemeral",
        phonetic: "/əˈfem(ə)rəl/",
        type: "vocabulary",
        definition: "Lasting for a very short time.",
        etymology: "From Greek ephēmeros 'lasting only one day'.",
        context: "In the context of digital interfaces, it refers to UI elements that appear only when needed (like this insight panel)."
    },
    "cybernetics": {
        term: "Cybernetics",
        phonetic: "/ˌsīberˈnediks/",
        type: "concept",
        definition: "The science of communications and automatic control systems in both machines and living things.",
        context: "Norbert Wiener defined it in 1948. Here, it signifies the feedback loop between the reader's gaze and the system's response."
    },
    "serendipity": {
        term: "Serendipity",
        phonetic: "/ˌserənˈdipədē/",
        type: "vocabulary",
        definition: "The occurrence and development of events by chance in a happy or beneficial way.",
        context: "The design goal is to engineer serendipity—finding knowledge you weren't actively looking for, but are glad you found."
    },
    "brutalist": {
        term: "Brutalist",
        phonetic: "/ˈbro͞odləst/",
        type: "concept",
        definition: "A style of architecture or design characterized by a deliberate plainness, crudity, or violence of imagery.",
        context: "Web Brutalism often uses raw HTML default styles, monospace fonts, and high contrast."
    }
};

// State
export const $activeInsight = atom<InsightData | null>(null);
export const $isHovering = atom<boolean>(false);

// Actions
export const setInsight = (term: string) => {
    const key = term.toLowerCase();
    const data = MOCK_INSIGHTS[key];
    if (data) {
        $activeInsight.set(data);
        $isHovering.set(true);
    }
};

export const clearInsight = () => {
    $activeInsight.set(null);
    $isHovering.set(false);
};
