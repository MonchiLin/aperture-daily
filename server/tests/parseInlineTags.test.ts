import { parseInlineTags, validateParseResult } from '../src/services/llm/parseInlineTags';

console.log("=== Testing parseInlineTags ===\n");

// Test 1: Simple case
console.log("Test 1: Simple sentence");
const input1 = "<S>The quick fox</S> <V>jumps</V> <PP>over the lazy dog</PP>.";
const result1 = parseInlineTags(input1);
console.log("Input:", input1);
console.log("Plain text:", result1.plainText);
console.log("Structures:", JSON.stringify(result1.structures, null, 2));
console.log("Validation:", validateParseResult(result1, input1));
console.log();

// Test 2: Nested tags
console.log("Test 2: Nested tags");
const input2 = "<PP>in <S>the garden</S></PP>";
const result2 = parseInlineTags(input2);
console.log("Input:", input2);
console.log("Plain text:", result2.plainText);
console.log("Structures:", JSON.stringify(result2.structures, null, 2));
console.log("Validation:", validateParseResult(result2, input2));
console.log();

// Test 3: Connective
console.log("Test 3: With connective");
const input3 = "<CON>However</CON>, <S>scientists</S> <V>discovered</V> <O>a new species</O>.";
const result3 = parseInlineTags(input3);
console.log("Input:", input3);
console.log("Plain text:", result3.plainText);
console.log("Structures:", JSON.stringify(result3.structures, null, 2));
console.log();

// Verify offset accuracy
console.log("=== Offset Accuracy Check ===");
for (const s of result3.structures) {
    const extracted = result3.plainText.slice(s.start, s.end);
    const match = extracted === s.extract;
    console.log(`[${s.role}] ${s.start}-${s.end}: "${s.extract}" => "${extracted}" ${match ? "✅" : "❌"}`);
}
