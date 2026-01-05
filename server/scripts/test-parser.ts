/**
 * Test script for the new AST Parser
 */
import { StructureParser, type RenderNode } from 'D:/Creative/aperture-daily/src/lib/structure/parser';
import { Database } from 'bun:sqlite';

const db = new Database('./local.db');
const row = db.query(`
    SELECT content, structure_json 
    FROM article_variants 
    WHERE article_id = ? AND level = 3
`).get('2d3e72c5-6a50-4375-95e5-a43fb8c4a69f') as any;

const content = row.content;
const structure = JSON.parse(row.structure_json);

console.log('=== Original Content Length ===', content.length);
console.log('=== Structure Count ===', structure.length);

// Focus on the problematic area ("lighting")
// "that promise vibrant lighting and stunning visuals"
const contextStart = content.indexOf('that promise');
const contextEnd = content.indexOf('visuals.') + 8;
const sentenceText = content.substring(contextStart, contextEnd);

console.log('\n=== Testing Substring Parser ===');
console.log('Text:', sentenceText);

// Filter structure for this range and adjust offsets relative to 0
const sentenceStructure = structure
    .filter((s: any) => s.start >= contextStart && s.end <= contextEnd)
    .map((s: any) => ({
        ...s,
        start: s.start - contextStart,
        end: s.end - contextStart
    }));

console.log('Structures:', sentenceStructure.map((s: any) => `${s.role.toUpperCase()}[${s.start}-${s.end}]`));

// Run the new Parser
const parser = new StructureParser(sentenceText, sentenceStructure);
const ast = parser.parse();

// Function to visualize the AST
function printAST(nodes: RenderNode[], indent = 0) {
    const spaces = ' '.repeat(indent * 2);
    nodes.forEach(node => {
        if (node.type === 'text') {
            console.log(`${spaces}TEXT: "${node.content}"`);
        } else if (node.type === 'newline') {
            console.log(`${spaces}NEWLINE`);
        } else if (node.type === 'element') {
            console.log(`${spaces}EL <${node.role}>`);
            printAST(node.children, indent + 1);
            console.log(`${spaces}END <${node.role}>`);
        }
    });
}

console.log('\n=== AST Output ===');
printAST(ast);

db.close();
