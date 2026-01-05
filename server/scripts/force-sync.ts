import { Database } from "bun:sqlite";
import * as path from 'path';

// Load env vars
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = process.env.CLOUDFLARE_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
    console.error("❌ Missing Cloudflare credentials in environment variables.");
    process.exit(1);
}

const LOCAL_DB_PATH = path.resolve(import.meta.dir, '../local.db');
const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

// Define topological order for valid insertion (Parent -> Child)
const TABLE_ORDER = [
    '__drizzle_migrations',
    'words',
    'generation_profiles',
    'tasks',
    'daily_word_references', // depends on words
    'articles',              // depends on tasks
    'article_variants',      // depends on articles
    'article_vocabulary',    // depends on articles
    'article_vocab_definitions', // depends on article_vocabulary
    'article_word_index',    // depends on articles
    'highlights',            // depends on articles
    // Add any others here if needed, unknown tables will be appended at the end
];

async function d1Query(sql: string, params: any[] = []) {
    const response = await fetch(D1_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql, params })
    });

    const data = await response.json();
    if (!data.success) {
        throw new Error(`D1 API Error: ${JSON.stringify(data.errors)}`);
    }
    return data.result?.[0]?.results || [];
}

async function wipeRemote() {
    console.log("🧹 Wiping remote D1 database...");

    const tables = await d1Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_cf_KV'");

    console.log(`   Found ${tables.length} tables to drop:`, tables.map((t: any) => t.name).join(', '));

    // Sort tables in reverse topological order (Children first, then Parents)
    tables.sort((a: any, b: any) => {
        let idxA = TABLE_ORDER.indexOf(a.name);
        let idxB = TABLE_ORDER.indexOf(b.name);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxB - idxA; // Descending order
    });

    console.log(`   Drop Order:`, tables.map((t: any) => t.name).join(' -> '));

    for (const table of tables) {
        console.log(`   Dropping ${table.name}...`);
        await d1Query(`DROP TABLE "${table.name}"`);
    }

    console.log("✅ Remote database wiped.");
}

async function generateLocalDump() {
    console.log(`📦 Reading local database from ${LOCAL_DB_PATH}...`);
    const db = new Database(LOCAL_DB_PATH);
    let tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];

    // Sort tables by topological order
    tables.sort((a, b) => {
        let idxA = TABLE_ORDER.indexOf(a.name);
        let idxB = TABLE_ORDER.indexOf(b.name);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
    });

    console.log("   Insertion Order:", tables.map(t => t.name).join(' -> '));

    let schemaStmts: string[] = [];
    let dataStmts: string[] = [];

    for (const { name } of tables) {
        // Schema
        const createStmt = db.query(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(name) as { sql: string };
        if (createStmt?.sql) {
            schemaStmts.push(createStmt.sql + ";");
        }

        // Data
        const rows = db.query(`SELECT * FROM "${name}"`).all();
        if (rows.length > 0) {
            console.log(`   Exporting ${rows.length} rows from ${name}...`);
        }

        for (const row of rows) {
            const columns = Object.keys(row as object);
            const values = Object.values(row as object).map(v =>
                v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
            );
            dataStmts.push(`INSERT INTO "${name}" (${columns.join(', ')}) VALUES (${values.join(', ')});`);
        }
    }

    db.close();
    return { schemaStmts, dataStmts };
}

async function pushStatements(label: string, statements: string[]) {
    if (statements.length === 0) return;
    console.log(`🚀 Pushing ${label} (${statements.length} statements)...`);

    const BATCH_SIZE = 20;

    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
        // Try without PRAGMA first since order is correct. 
        // If needed, we can add it back, but if D1 ignores it inside trans, better rely on order.
        const batch = statements.slice(i, i + BATCH_SIZE);
        const sql = batch.join('\n');

        try {
            await d1Query(sql);
            process.stdout.write('.');
        } catch (e) {
            console.error(`\n❌ Failed to execute batch starting at index ${i}:`, e);
            throw e;
        }
    }
    console.log("\n✅ Done.");
}

async function main() {
    try {
        await wipeRemote();
        const { schemaStmts, dataStmts } = await generateLocalDump();

        // Push schema 
        await pushStatements("Schema", schemaStmts);

        // Push data
        await pushStatements("Data", dataStmts);

        console.log("🎉 Database Sync Successful!");
    } catch (e) {
        console.error("Fatal Error:", e);
        process.exit(1);
    }
}

main();
