import type { Config } from 'drizzle-kit';

export default {
    schema: './db/schema.ts',
    out: './migrations',
    dialect: 'sqlite',
    dbCredentials: {
        url: 'file:./local.db'
    }
} satisfies Config;
