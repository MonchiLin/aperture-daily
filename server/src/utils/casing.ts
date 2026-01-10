/**
 * Casing Utility for standardizing API responses
 * 
 * Our Database is snake_case (SQLite/Postgres standard).
 * Our API (Frontend) expects camelCase (JS standard).
 * 
 * We use this utility to transform DB rows to API responses at the boundary.
 */

// Simple snake_to_camel converter
const snakeToCamel = (str: string) =>
    str.replace(/([-_][a-z])/g, (group) =>
        group.toUpperCase().replace('-', '').replace('_', '')
    );

const isObject = (o: unknown): o is Record<string, unknown> =>
    o !== null && typeof o === 'object' && !Array.isArray(o);

export function toCamelCase<T>(obj: unknown): T {
    if (Array.isArray(obj)) {
        return obj.map((v) => toCamelCase(v)) as unknown as T;
    }

    if (isObject(obj)) {
        const n: Record<string, unknown> = {};
        Object.keys(obj).forEach((k) => {
            const camelK = snakeToCamel(k);
            n[camelK] = toCamelCase(obj[k]);
        });
        return n as T;
    }

    return obj as T;
}
