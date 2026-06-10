/**
 * Database connection pool module.
 * Provides a configured pg Pool and a Fastify plugin for request-scoped tenant isolation.
 */

export { default as dbPlugin, getStoreClient } from './plugin.js';
export { createPool } from './pool.js';
export { runMigrations } from './migrate.js';
