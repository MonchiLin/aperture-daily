
import { z } from 'zod';
import { dailyNewsOutputSchema } from './dailyNews';

// ============ Stage 1: Search & Selection ============

export const Stage1OutputSchema = z.object({
    selected_words: z.array(z.string()).min(1, 'At least one word must be selected'),
    news_summary: z.string().min(10, 'News summary too short'),
    source: z.string().optional(),
    sources: z.array(z.string()).optional(),
});

export type Stage1OutputDTO = z.infer<typeof Stage1OutputSchema>;


// ============ Stage 2: Draft Generation ============

export const Stage2OutputSchema = z.object({
    draftText: z.string().min(100, 'Draft text too short (min 100 chars)')
});

export type Stage2OutputDTO = z.infer<typeof Stage2OutputSchema>;


// ============ Stage 3: JSON Conversion ============

export const Stage3OutputSchema = dailyNewsOutputSchema;

export type Stage3OutputDTO = z.infer<typeof Stage3OutputSchema>;


// ============ Stage 4: Sentence Analysis ============

// These are typically partial updates or full objects. 
// For Stage 4, we usually validate the ArticleWithAnalysis structure, 
// but since it's a complex recursive/large object, we often trust the provider's internal checks 
// or use the existing `ArticleWithAnalysis` type.
// We'll define a simpler schema for the *LLM output* (which is per-paragraph JSON usually),
// but the Provider method returns the full ArticleWithAnalysis[].

export const ParagraphAnalysisSchema = z.record(
    z.array(
        z.object({
            text: z.string(),
            role: z.string()
        })
    )
);
