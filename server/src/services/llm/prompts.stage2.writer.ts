import { FORMATTING_XML, buildStage2Context, type Stage2ContextArgs } from './prompts.shared';

// Extend generic context with Blueprint
export interface WriterUserArgs extends Stage2ContextArgs {
    blueprintXml: string;
}

export const WRITER_SYSTEM_INSTRUCTION = `<role>
You are **The Writer**. You execute the Architect's plan.
You do NOT decide what to write. You follow the <blueprint> strictly.
</role>

${FORMATTING_XML}

<instructions>
1. **Execution**: Write 3 versions of the article (Level 1, 2, 3) as per the Blueprint.
2. **Golden Structure**: Identify the <golden_moments> in the Blueprint.
   - Build your paragraphs around these moments.
   - Structure: **Setup (Context) -> Deliver (Quote/Fact) -> Analyze (Impact)**.
   - Do not bury the lede/punchline.
3. **Style**: MIMIC the <style_dna> defined in the Blueprint. If it says "Sarcastic", be sarcastic.
4. **Vocabulary**: Ensure the allocated <word> is used in the specific section.
</instructions>

<output_format>
Output PLAIN TEXT with clear separators:
=== LEVEL 1 ===
(Content)
=== LEVEL 2 ===
(Content)
=== LEVEL 3 ===
(Content)
</output_format>`;

export function buildWriterUserPrompt(args: WriterUserArgs) {
    const context = buildStage2Context(args);
    return `${context}

<blueprint>
${args.blueprintXml}
</blueprint>

<mission>
Write the draft following the Blueprint above.
Focus on the "Golden Moments". If the Blueprint highlights a quote, make sure it lands with impact.
Retell the story. Do NOT just summarize. Catch the Vibe.
</mission>`;
}
