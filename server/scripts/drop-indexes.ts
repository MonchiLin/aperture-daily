import { Database } from 'bun:sqlite';

const db = new Database('local.db');

console.log('Fetching all tables...');
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").all() as { name: string }[];

db.transaction(() => {
    for (const table of tables) {
        console.log(`Checking table: ${table.name}`);
        const indexes = db.query(`PRAGMA index_list("${table.name}")`).all() as any[];

        for (const idx of indexes) {
            // Drop everything that isn't a primary key
            if (idx.origin === 'pk') continue;

            console.log(`  Dropping index: ${idx.name} (origin: ${idx.origin})`);
            try {
                db.run(`DROP INDEX IF EXISTS "${idx.name}"`);
            } catch (e) {
                console.error(`  Failed to drop ${idx.name}:`, e);
            }
        }
    }
})();

// Hardcoded fallback list from schema.ts
const explicitIndexes = [
    'uq_generation_profiles_name',
    'idx_generation_profiles_topic_preference',
    'idx_tasks_task_date',
    'idx_tasks_type',
    'idx_tasks_status',
    'idx_tasks_profile_id',
    'idx_tasks_published_at',
    'uq_daily_word_ref',
    'idx_daily_word_ref_date',
    'idx_daily_word_ref_word',
    'idx_words_origin',
    'uq_articles_unique',
    'idx_articles_generation_task_id',
    'idx_articles_status',
    'idx_articles_published',
    'uq_article_variant_level',
    'idx_article_variant_article_id',
    'uq_article_vocab_word',
    'idx_article_vocab_article_id',
    'idx_vocab_def_vocab_id',
    'idx_vocab_def_pos',
    'idx_highlights_article_id',
    'idx_highlights_actor',
    'idx_highlights_article_actor',
    'idx_awi_word',
    'idx_awi_article_id',
    'uq_awi_word_article'
];

db.transaction(() => {
    console.log("Running explicit drop list...");
    for (const name of explicitIndexes) {
        try {
            db.run(`DROP INDEX IF EXISTS "${name}"`);
            console.log(`  Explicitly dropped: ${name}`);
        } catch (e) {
            // ignore
        }
    }
})();

console.log('All indexes dropped. Ready for migration.');
