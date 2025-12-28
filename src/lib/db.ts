import { drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../../db/schema';

/**
 * 获取数据库实例
 * 仅支持 Docker/Node.js 环境 (通过 D1 HTTP API 远程访问)
 */
export function getDb(_locals?: App.Locals) {
	const token = process.env.CLOUDFLARE_D1_API_TOKEN;
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;

	if (!token || !accountId || !databaseId) {
		throw new Error('Missing Cloudflare D1 configuration (CLOUDFLARE_D1_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID)');
	}

	return drizzleProxy(async (sql, params, method) => {
		try {
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
				{
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ sql, params, method }),
				}
			);

			const data = await response.json() as any;
			if (!response.ok) {
				throw new Error(data.errors?.[0]?.message || 'D1 API Error');
			}

			// Transform D1 HTTP API result to Drizzle Proxy format:
			// { rows: [...], columns: [...] }
			const result = data.result[0];
			return {
				rows: result.results.map((row: any) => Object.values(row)),
				columns: result.columns,
			};
		} catch (e) {
			console.error('D1 Remote Query Failed:', e);
			throw e;
		}
	}, { schema });
}
