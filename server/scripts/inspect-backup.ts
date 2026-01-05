import { readFileSync } from 'fs';

const articleId = 'eddc8874-1f7e-4559-ae39-f3d6dd01b004';
const path = 'backups/articles.json';

try {
    const raw = readFileSync(path, 'utf8');
    const articles = JSON.parse(raw);
    const target = articles.find((a: any) => a.id === articleId);

    if (target) {
        console.log("Found target article in backup.");
        const content = JSON.parse(target.content_json);
        const data = content.result || content;

        if (data.articles) {
            console.log("Variants found:", data.articles.length);
            data.articles.forEach((v: any, i: number) => {
                console.log(`Variant ${i} keys:`, Object.keys(v));
                if (v.structure) console.log(`Variant ${i} HAS STRUCTURE!`);
                if (v.grammar_analysis) console.log(`Variant ${i} HAS GRAMMAR ANALYSIS!`);
            });
        }
    } else {
        console.log("Target article NOT found in backup.");
    }

} catch (e) {
    console.error(e);
}
