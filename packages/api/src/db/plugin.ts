/**
 * Fastify plugin that registers the PostgreSQL connection pool
 * and provides request-scoped tenant isolation via `app.current_store_id`.
 */

import fp from 'fastify-plugin';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { createPool } from './pool.js';

declare module 'fastify' {
  interface FastifyInstance {
    pg: pg.Pool;
  }
  interface FastifyRequest {
    /** Store ID for tenant-scoped queries (set by auth middleware) */
    storeId?: string;
    /** Authenticated user payload (set by auth middleware) */
    user?: {
      userId: string;
      storeId: string;
      email: string;
      role: string;
    };
  }
}

export interface DbPluginOptions {
  connectionString: string;
  poolMax?: number;
}

async function dbPluginImpl(
  fastify: FastifyInstance,
  options: DbPluginOptions
): Promise<void> {
  const pool = createPool({
    connectionString: options.connectionString,
    max: options.poolMax,
  });

  // Verify connection on startup
  const client = await pool.connect();
  client.release();

  // Decorate the Fastify instance with the pool
  fastify.decorate('pg', pool);

  // Decorate requests with storeId placeholder (set by auth middleware later)
  fastify.decorateRequest('storeId', undefined);

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await pool.end();
  });
}

export default fp(dbPluginImpl, {
  name: 'db',
  fastify: '4.x',
});

/**
 * Helper: acquire a client from the pool with tenant isolation set.
 * Usage in route handlers:
 *   const client = await getStoreClient(request.server.pg, request.storeId);
 *   try { ... } finally { client.release(); }
 */
export async function getStoreClient(
  pool: pg.Pool,
  storeId?: string
): Promise<pg.PoolClient> {
  const client = await pool.connect();
  if (storeId) {
    await client.query("SELECT set_config('app.current_store_id', $1, TRUE)", [storeId]);
  }
  return client;
}
