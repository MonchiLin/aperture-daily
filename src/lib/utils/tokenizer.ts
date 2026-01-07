
/**
 * Universal Text Tokenizer
 * 
 * Single source of truth for splitting text into sentences and paragraphs.
 * Used by BOTH:
 * 1. AudioInit / AudioPreloader (to generate TTS text and map timestamps)
 * 2. HighlighterLogic (to map DOM nodes to Sentence IDs)
 * 
 * Guarantees synchronization by using the exact same normalization logic.
 */

export interface TextSegment {
    id: number;          // Global Sentence ID (0, 1, 2...)
    text: string;        // The clean text of the sentence
    rawOffsets: {        // Character range in the original full raw text
        start: number;
        end: number;
    };
    isNewParagraph: boolean; // Does this sentence start a new paragraph?
}

export class UniversalTokenizer {
    private fullText: string;
    private segments: TextSegment[] = [];

    constructor(rawContent: string) {
        // Prepare the text (normalize newlines, but KEEP them as semantic boundaries)
        // We do basic normalization but respect the input structure.
        this.fullText = rawContent;
        this.tokenize();
    }

    private tokenize() {
        // 1. Split into paragraphs first to preserve block structure
        // Titles and Paragraphs are separated by newlines in raw content.
        const paragraphs = this.fullText.split('\n');

        let globalCharOffset = 0;
        let globalSentenceId = 0;

        const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

        paragraphs.forEach((paraRaw, _paraIdx) => {
            // "Ghost" paragraphs (empty lines) still consume char count but have no sentences
            if (!paraRaw.trim()) {
                globalCharOffset += paraRaw.length + 1; // +1 for the newline used in split
                return;
            }

            const sentences = Array.from(segmenter.segment(paraRaw));

            sentences.forEach((s, sIdx) => {
                this.segments.push({
                    id: globalSentenceId++,
                    text: s.segment,
                    // Map local paragraph offset to global offset
                    rawOffsets: {
                        start: globalCharOffset + s.index,
                        end: globalCharOffset + s.index + s.segment.length
                    },
                    isNewParagraph: sIdx === 0 // First sentence of a block is a new paragraph
                });
            });

            // Advance global offset: paragraph length + 1 (the newline we split on)
            // Note: split consumes the delimiter, so we add it back conceptually for offsets
            globalCharOffset += paraRaw.length + 1;
        });
    }

    public getSegments(): TextSegment[] {
        return this.segments;
    }

    public getFullTextForTTS(): string {
        // Reconstruct text specifically optimized for TTS quality.
        // We join with newlines to ensure TTS pauses between blocks.
        // But for sentences within a paragraph, we might want spaces? 
        // Actually, Intl.Segmenter preserves spaces. 
        // Best approach: Just verify the segments join back? 
        // No, we want to control the joiner.

        // Strategy: "Block-preserving Join"
        // If isNewParagraph=true, prepend \n (unless first).
        // Else, just append (since Intl.Segmenter keeps trailing spaces usually).

        // Actually, simpler: Just join with space?
        // NO. The issue was "Title" + "Body" becoming "TitleBody".
        // We want "Title" + "\n" + "Body".

        // Let's rebuild based on isNewParagraph.
        let ttsBuild = "";
        this.segments.forEach((seg, i) => {
            if (i > 0) {
                if (seg.isNewParagraph) {
                    ttsBuild += "\n";
                } else {
                    // Check if previous segment ended with space? 
                    // Usually segment includes trailing punctuation/space. 
                    // But strictly, we should ensure a space if missing.
                    const prev = this.segments[i - 1];
                    if (!prev.text.match(/\s$/)) {
                        ttsBuild += " ";
                    }
                }
            }
            ttsBuild += seg.text;
        });
        return ttsBuild;
    }
}
