/**
 * Store onboarding and configuration routes:
 * - GET /api/stores/:id       — Retrieve store profile
 * - PUT /api/stores/:id       — Update store metadata
 * - POST /api/stores/:id/complete-onboarding — Mark onboarding complete, activate default plugins
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { guardMiddleware } from '../auth/middleware.js';
import { getStoreClient } from '../db/plugin.js';

interface StoreParams {
  id: string;
}

interface UpdateStoreBody {
  name?: string;
  category?: 'grocery' | 'specialty' | 'general';
  location?: string;
  approximate_sku_count?: number;
  primary_suppliers?: string[];
  pos_system?: string | null;
}

/** Default plugins activated when a store completes onboarding */
const DEFAULT_PLUGINS = [
  'data-ingestion',
  'data-normalizer',
  'sales-intelligence',
];

export async function storeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:id
   * Returns the authenticated user's store profile.
   * Enforces that the requested store ID matches the authenticated user's storeId.
   */
  fastify.get<{ Params: StoreParams }>(
    '/api/stores/:id',
    { preHandler: [guardMiddleware] },
    async (request: FastifyRequest<{ Params: StoreParams }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Enforce tenant isolation: user can only access their own store
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access your own store profile.',
            retryable: false,
          },
        });
      }

      const client = await getStoreClient(fastify.pg, request.storeId);
      try {
        const result = await client.query(
          `SELECT id, name, category, location, approximate_sku_count, primary_suppliers, pos_system, created_at, updated_at
           FROM stores WHERE id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'STORE_NOT_FOUND',
              message: 'Store not found.',
              retryable: false,
            },
          });
        }

        const store = result.rows[0];
        return reply.code(200).send({
          store: {
            id: store.id,
            name: store.name,
            category: store.category,
            location: store.location,
            approximateSkuCount: store.approximate_sku_count,
            primarySuppliers: store.primary_suppliers,
            posSystem: store.pos_system,
            createdAt: store.created_at,
            updatedAt: store.updated_at,
          },
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * PUT /api/stores/:id
   * Updates store metadata (category, approximate_sku_count, primary_suppliers, pos_system, name, location).
   */
  fastify.put<{ Params: StoreParams; Body: UpdateStoreBody }>(
    '/api/stores/:id',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams; Body: UpdateStoreBody }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only update your own store profile.',
            retryable: false,
          },
        });
      }

      const body = request.body ?? {};
      const { name, category, location, approximate_sku_count, primary_suppliers, pos_system } =
        body;

      // Validate category if provided
      if (category && !['grocery', 'specialty', 'general'].includes(category)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'category must be one of: grocery, specialty, general.',
            retryable: false,
          },
        });
      }

      // Validate approximate_sku_count if provided
      if (approximate_sku_count !== undefined && (typeof approximate_sku_count !== 'number' || approximate_sku_count < 0)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'approximate_sku_count must be a non-negative number.',
            retryable: false,
          },
        });
      }

      // Validate primary_suppliers if provided
      if (primary_suppliers !== undefined && !Array.isArray(primary_suppliers)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'primary_suppliers must be an array of strings.',
            retryable: false,
          },
        });
      }

      // Build dynamic UPDATE query
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (category !== undefined) {
        setClauses.push(`category = $${paramIndex++}`);
        values.push(category);
      }
      if (location !== undefined) {
        setClauses.push(`location = $${paramIndex++}`);
        values.push(location);
      }
      if (approximate_sku_count !== undefined) {
        setClauses.push(`approximate_sku_count = $${paramIndex++}`);
        values.push(approximate_sku_count);
      }
      if (primary_suppliers !== undefined) {
        setClauses.push(`primary_suppliers = $${paramIndex++}`);
        values.push(primary_suppliers);
      }
      if (pos_system !== undefined) {
        setClauses.push(`pos_system = $${paramIndex++}`);
        values.push(pos_system);
      }

      if (setClauses.length === 0) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one field must be provided for update.',
            retryable: false,
          },
        });
      }

      // Always update the updated_at timestamp
      setClauses.push(`updated_at = NOW()`);

      const client = await getStoreClient(fastify.pg, request.storeId);
      try {
        values.push(id);
        const query = `UPDATE stores SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, category, location, approximate_sku_count, primary_suppliers, pos_system, created_at, updated_at`;

        const result = await client.query(query, values);

        if (result.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'STORE_NOT_FOUND',
              message: 'Store not found.',
              retryable: false,
            },
          });
        }

        const store = result.rows[0];
        return reply.code(200).send({
          store: {
            id: store.id,
            name: store.name,
            category: store.category,
            location: store.location,
            approximateSkuCount: store.approximate_sku_count,
            primarySuppliers: store.primary_suppliers,
            posSystem: store.pos_system,
            createdAt: store.created_at,
            updatedAt: store.updated_at,
          },
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * POST /api/stores/:id/complete-onboarding
   * Marks onboarding as complete and activates default plugins for the store.
   */
  fastify.post<{ Params: StoreParams }>(
    '/api/stores/:id/complete-onboarding',
    { preHandler: [guardMiddleware] },
    async (request: FastifyRequest<{ Params: StoreParams }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only complete onboarding for your own store.',
            retryable: false,
          },
        });
      }

      const client = await getStoreClient(fastify.pg, request.storeId);
      try {
        // Verify the store exists
        const storeResult = await client.query(
          'SELECT id FROM stores WHERE id = $1',
          [id]
        );

        if (storeResult.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'STORE_NOT_FOUND',
              message: 'Store not found.',
              retryable: false,
            },
          });
        }

        // Activate default plugins for the store (upsert to avoid duplicates)
        const activatedPlugins: string[] = [];
        for (const pluginId of DEFAULT_PLUGINS) {
          await client.query(
            `INSERT INTO plugin_activations (store_id, plugin_id, is_active, config, activated_at)
             VALUES ($1, $2, TRUE, '{}', NOW())
             ON CONFLICT (store_id, plugin_id)
             DO UPDATE SET is_active = TRUE, activated_at = NOW(), deactivated_at = NULL`,
            [id, pluginId]
          );
          activatedPlugins.push(pluginId);
        }

        return reply.code(200).send({
          message: 'Onboarding complete. Default plugins activated.',
          activatedPlugins,
        });
      } finally {
        client.release();
      }
    }
  );
}
