/**
 * Centralized Database Types
 * 
 * This file exports the correct database type that works with both
 * BunSQLite (local) and SqliteProxy (D1 HTTP API).
 */

import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import type * as schema from '../../db/schema';

/**
 * The database instance type used throughout the application.
 * Uses SqliteRemoteDatabase since we connect to D1 via HTTP proxy.
 */
export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

/**
 * Re-export the schema for convenience
 */
export type { schema };
