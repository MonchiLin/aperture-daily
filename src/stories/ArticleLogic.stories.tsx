import type { Meta, StoryObj } from '@storybook/react';
import React, { useEffect } from 'react';
import VisualTether from '../components/VisualTether';
import { interactionStore, setActiveWord, setLevel } from '../lib/store/interactionStore';
import '../styles/structure.css';

// Mock Component to simulate the Article Page Environment
const ArticleSimulation = ({ difficulty = 1 }: { difficulty: number }) => {
    // Simulate initial setup
    useEffect(() => {
        setLevel(difficulty);
    }, [difficulty]);

    // Simulate functionality normally found in HighlightManager/highlighterLogic and WordSidebar script
    useEffect(() => {
        const cards = document.querySelectorAll('[data-word-card]');
        const handleCardEnter = (e: Event) => {
            const word = (e.currentTarget as HTMLElement).getAttribute('data-word-card');
            if (word) setActiveWord(word);
        };
        const handleCardLeave = () => setActiveWord(null);

        cards.forEach(c => {
            c.addEventListener('mouseenter', handleCardEnter);
            c.addEventListener('mouseleave', handleCardLeave);
        });

        const words = document.querySelectorAll('.target-word');
        const handleWordEnter = (e: Event) => {
            const word = (e.currentTarget as HTMLElement).getAttribute('data-word');
            if (word) setActiveWord(word);
        };
        const handleWordLeave = () => setActiveWord(null);

        words.forEach(w => {
            w.addEventListener('mouseenter', handleWordEnter);
            w.addEventListener('mouseleave', handleWordLeave);
        });

        const unsub = interactionStore.subscribe(state => {
            const activeWord = state.activeWord;
            cards.forEach(card => {
                const word = card.getAttribute('data-word-card');
                if (activeWord && word === activeWord) {
                    card.classList.add('scale-105', 'bg-white', 'shadow-xl', 'border-transparent', 'ring-1', 'ring-stone-200');
                    card.classList.remove('border-stone-100');
                } else {
                    card.classList.remove('scale-105', 'bg-white', 'shadow-xl', 'border-transparent', 'ring-1', 'ring-stone-200');
                    card.classList.add('border-stone-100');
                }
            });
        });

        return () => {
            cards.forEach(c => {
                c.removeEventListener('mouseenter', handleCardEnter);
                c.removeEventListener('mouseleave', handleCardLeave);
            });
            words.forEach(w => {
                w.removeEventListener('mouseenter', handleWordEnter);
                w.removeEventListener('mouseleave', handleWordLeave);
            });
            unsub();
        }
    }, []);

    return (
        <div className="min-h-screen bg-[#F9F9F8] p-8 font-serif text-[#2D2D2D]">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12 relative">
                <div className="space-y-8">
                    <h1 className="text-5xl font-bold font-display tracking-tight leading-tight">The Renaissance of Analog</h1>
                    <div className="article-level" data-level="1" style={{ display: difficulty === 1 ? 'block' : 'none' }}>
                        <p className="drop-cap-p text-xl leading-loose text-justify mb-6">In an era defined by digital convenience, the resurgence of <span className="target-word" data-word="ephemeral">ephemeral</span> trends is remarkable.</p>
                    </div>
                </div>
                <VisualTether />
            </div>
        </div>
    );
};

const meta: Meta<typeof ArticleSimulation> = {
    title: 'Experiments/ArticleInteraction',
    component: ArticleSimulation,
    parameters: { layout: 'fullscreen' },
    argTypes: { difficulty: { control: { type: 'select', options: [1, 2] } } }
};

export default meta;
type Story = StoryObj<typeof ArticleSimulation>;

export const Default: Story = { args: { difficulty: 1 } };
export const MultiLevel: Story = { args: { difficulty: 2 } };

// Import the label positioner for the test story
import { positionStructureLabels, clearLabels } from '../lib/features/structure/labelPositioner';

// Wrapper component that initializes labels on mount
const StructureOverlapTestComponent = () => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        // Position labels after render
        if (containerRef.current) {
            positionStructureLabels(containerRef.current);
        }
        return () => clearLabels();
    }, []);

    return (
        <div ref={containerRef} id="article-content" className="p-12 bg-white min-h-screen font-serif" style={{ fontSize: '24px', lineHeight: '2.5', fontFamily: 'Georgia, serif' }}>
            <h2 className="text-2xl font-bold mb-8">Structure Label Overlap Test Suite</h2>
            <p className="text-sm text-slate-500 mb-12">Each case tests a specific overlap scenario. Labels should NOT collide.</p>

            <div className="space-y-16 max-w-4xl">
                {/* Case 1: Adjacent Subject / Verb / Object */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 1: Adjacent S-V-O Chain
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="1">Harry</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="1">talks</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="1">about the list</span>
                        </span>.
                    </p>
                </div>

                {/* Case 2: Short Words (He is) */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 2: Short Words (2-3 chars)
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="2">He</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="2">is</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="2">a prince</span>
                        </span>.
                    </p>
                </div>

                {/* Case 3: Connective + S-V */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 3: Connective Before S-V (Multi-Layer)
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="connective">
                            <span className="s-token structure-active bg-yellow-100" data-sid="3">However</span>
                        </span>,
                        <span> </span>
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="3">the fox</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="3">jumps</span>
                        </span>
                        <span> </span>
                        <span data-structure="prep-phrase">
                            <span className="s-token structure-active bg-yellow-100" data-sid="3">over the dog</span>
                        </span>.
                    </p>
                </div>

                {/* Case 4: Passive Voice */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 4: Passive Voice
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="4">The room</span>
                        </span>
                        <span> </span>
                        <span data-structure="passive">
                            <span className="s-token structure-active bg-yellow-100" data-sid="4">was cleaned</span>
                        </span>
                        <span> </span>
                        <span data-structure="prep-phrase">
                            <span className="s-token structure-active bg-yellow-100" data-sid="4">by the staff</span>
                        </span>.
                    </p>
                </div>

                {/* Case 5: Relative Clause Nested */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 5: Relative Clause (Layer 3)
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="5">The man</span>
                        </span>
                        <span> </span>
                        {/* Nested RC Structure for Interaction Test */}
                        <span data-structure="rel-clause">
                            <span className="s-token structure-active bg-yellow-100" data-sid="5">
                                <span data-structure="subject"><span className="structure-active">who</span></span>
                                <span> </span>
                                <span data-structure="verb"><span className="structure-active">wore</span></span>
                                <span> </span>
                                <span data-structure="object"><span className="structure-active">a hat</span></span>
                            </span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="5">left</span>
                        </span>.
                    </p>
                </div>

                {/* Case 6: Dense Adjacent Labels */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 6: Dense Adjacent (Worst Case)
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="connective">
                            <span className="s-token structure-active bg-yellow-100" data-sid="6">And</span>
                        </span>
                        <span> </span>
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="6">I</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="6">am</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="6">it</span>
                        </span>.
                    </p>
                </div>

                {/* Case 7: All Layers Combined */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 7: All Layers Combined
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="connective">
                            <span className="s-token structure-active bg-yellow-100" data-sid="7">Therefore</span>
                        </span>,
                        <span> </span>
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="7">the scientist</span>
                        </span>
                        <span> </span>
                        <span data-structure="rel-clause">
                            <span className="s-token structure-active bg-yellow-100" data-sid="7">who discovered it</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="7">published</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="7">the paper</span>
                        </span>
                        <span> </span>
                        <span data-structure="prep-phrase">
                            <span className="s-token structure-active bg-yellow-100" data-sid="7">in Nature</span>
                        </span>.
                    </p>
                </div>

                {/* Case 8: Multi-Paragraph */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 8: Multi-Paragraph Article
                    </h3>
                    <p className="leading-loose mb-4">
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="8">The researchers</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="8">discovered</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="8">a new species</span>
                        </span>
                        <span> </span>
                        <span data-structure="prep-phrase">
                            <span className="s-token structure-active bg-yellow-100" data-sid="8">in the Amazon</span>
                        </span>.
                    </p>
                    <p className="leading-loose mb-4">
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="9">This discovery</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="9">represents</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="9">a major breakthrough</span>
                        </span>.
                    </p>
                    <p className="leading-loose">
                        <span data-structure="connective">
                            <span className="s-token structure-active bg-yellow-100" data-sid="10">Furthermore</span>
                        </span>,
                        <span> </span>
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="10">it</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="10">challenges</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="10">existing theories</span>
                        </span>.
                    </p>
                </div>

                {/* Case 9: Long Sentence */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 9: Long Complex Sentence
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="11">The global economy</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="11">has experienced</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="11">significant changes</span>
                        </span>
                        <span> </span>
                        <span data-structure="prep-phrase">
                            <span className="s-token structure-active bg-yellow-100" data-sid="11">over the past decade</span>
                        </span>,
                        <span> </span>
                        <span data-structure="connective">
                            <span className="s-token structure-active bg-yellow-100" data-sid="11">particularly</span>
                        </span>
                        <span> </span>
                        <span data-structure="prep-phrase">
                            <span className="s-token structure-active bg-yellow-100" data-sid="11">in emerging markets</span>
                        </span>.
                    </p>
                </div>

                {/* Case 10: Question Form */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 10: Question Form
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="12">Did</span>
                        </span>
                        <span> </span>
                        <span data-structure="subject">
                            <span className="s-token structure-active bg-yellow-100" data-sid="12">the committee</span>
                        </span>
                        <span> </span>
                        <span data-structure="verb">
                            <span className="s-token structure-active bg-yellow-100" data-sid="12">approve</span>
                        </span>
                        <span> </span>
                        <span data-structure="object">
                            <span className="s-token structure-active bg-yellow-100" data-sid="12">the proposal</span>
                        </span>?
                    </p>
                </div>

                {/* Case 11: Nested Opacity Swap Interaction */}
                <div>
                    <h3 className="text-sm font-sans text-slate-400 mb-4 uppercase tracking-wide border-b pb-2">
                        Case 11: Nested Opacity Swap (Hover Interaction)
                    </h3>
                    <p className="leading-loose">
                        <span data-structure="s">
                            <span className="structure-active">The CEO</span>
                        </span>
                        {' '}
                        <span data-structure="v">
                            <span className="structure-active">gave</span>
                        </span>
                        {' '}
                        <span data-structure="io">
                            <span className="structure-active">the team</span>
                        </span>
                        {' '}
                        <span data-structure="rc" style={{ cursor: 'pointer' }}>
                            <span className="structure-active">
                                <span data-structure="s"><span className="structure-active">who</span></span>
                                {' '}
                                <span data-structure="adv"><span className="structure-active">successfully</span></span>
                                {' '}
                                <span data-structure="v"><span className="structure-active">completed</span></span>
                                {' '}
                                <span data-structure="o"><span className="structure-active">the project</span></span>
                            </span>
                        </span>
                        {' '}
                        <span data-structure="o">
                            <span className="structure-active">a bonus</span>
                        </span>.
                    </p>
                    <p className="text-sm text-slate-400 mt-4 italic">
                        Hover over "who successfully completed..." to test the opacity swap.
                    </p>
                </div>
            </div>

            <div className="fixed bottom-4 right-4 text-xs text-slate-400 bg-slate-100 p-3 rounded max-w-xs">
                <strong>Legend:</strong><br />
                S = Subject, V = Verb, O = Object<br />
                CON = Connective, PP = Prep Phrase<br />
                RC = Rel Clause, PAS = Passive
            </div>
        </div>
    );
};

// Export the story that uses the component
export const StructureOverlapTest: Story = {
    render: () => <StructureOverlapTestComponent />
};
