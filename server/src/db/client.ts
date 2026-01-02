import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../../db/schema';

// Configuration from env
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = process.env.CLOUDFLARE_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
    throw new Error("Missing Cloudflare D1 credentials. STRICT MODE: Local DB is disabled.");
}

/**
 * Cloudflare D1 HTTP Proxy
 * 
 * Since this backend runs on a standard Docker container (not a Cloudflare Worker),
 * we cannot use the native D1 binding. 
 * Instead, we use `sqlite-proxy` to forward all SQL queries to the Cloudflare D1 HTTP API.
 * 
 * NOTE: This introduces network latency for each query.
 */
export const db = drizzle(async (sql, params, method) => {
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sql: sql,
                params: params
            })
        });

        const text = await response.text();
        let data: any;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Failed to parse D1 response: ${text.slice(0, 100)}...`);
        }

        if (!data.success) {
            console.error('D1 API Error (Detailed):', JSON.stringify(data.errors, null, 2));
            throw new Error(`D1 API Error: ${data.errors?.[0]?.message || 'Unknown error'}`);
        }

        const firstResult = data.result?.[0];
        const rows = firstResult?.results || [];

        return { rows };
    } catch (e) {
        console.error("D1 Proxy Fetch Error:", e);
        throw e;
    }
}, { schema });

// Helper to check connection type (Always true now)
export const isD1 = true;

console.log(`[DB] Using Cloudflare D1 (HTTP Proxy) - Account: ${ACCOUNT_ID}, DB: ${DATABASE_ID}`);
