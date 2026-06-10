/**
 * Duplicate detection API routes:
 * - GET /api/stores/:id/duplicates           — List pending duplicate candidates
 * - POST /api/stores/:id/duplicates/:duplicateId/resolve — Resolve a duplicate (merge or reject)
 *
 * Validates: Requirements 3.1, 3.2
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { guardMiddleware } from '../auth/middleware.js';
import { getStoreClient } from '../db/plugin.js';

interface StoreParams {
  id: string;
}

interface DuplicateResolveParams {
  id: string;
  duplicateId: string;
}

interface ResolveBody {
  action: 'merge' | 'reject';
}

export async function duplicateRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:id/duplicates
   * Returns pending duplicate candidates for the store.
   */
  fastify.get<{ Params: StoreParams }>(
    '/api/stores/:id/duplicates',
    { preHandler: [guardMiddleware] },
    async (request: FastifyRequest<{ Params: StoreParams }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access your own store data.',
            retryable: false,
          },
        });
      }

      const client = await getStoreClient(fastify.pg, request.storeId);
      try {
        const result = await client.query(
          `SELECT
            dc.id,
            dc.store_id,
            dc.product_a_id,
            dc.product_b_id,
            dc.similarity_score,
            dc.status,
            dc.detected_at,
            dc.resolved_at,
            pa.name AS product_a_name,
            pb.name AS product_b_name
          FROM duplicate_candidates dc
          JOIN products pa ON pa.id = dc.product_a_id
          JOIN products pb ON pb.id = dc.product_b_id
          WHERE dc.store_id = $1 AND dc.status = 'pending'
          ORDER BY dc.similarity_score DESC`,
          [id]
        );

        return reply.code(200).send({
          duplicates: result.rows.map((row) => ({
            id: row.id,
            storeId: row.store_id,
            productAId: row.product_a_id,
            productBId: row.product_b_id,
            productAName: row.product_a_name,
            productBName: row.product_b_name,
            similarityScore: parseFloat(row.similarity_score),
            status: row.status,
            detectedAt: row.detected_at,
            resolvedAt: row.resolved_at,
          })),
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * POST /api/stores/:id/duplicates/:duplicateId/resolve
   * Resolves a duplicate candidate pair (merge or reject).
   *
   * If action is 'merge': merge product B into product A
   *   - Update sales records to point to product A
   *   - Deactivate product B
   *   - Set status = 'merged'
   *
   * If action is 'reject': set status = 'rejected'
   */
  fastify.post<{ Params: DuplicateResolveParams; Body: ResolveBody }>(
    '/api/stores/:id/duplicates/:duplicateId/resolve',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: DuplicateResolveParams; Body: ResolveBody }>,
      reply: FastifyReply
    ) => {
      const { id, duplicateId } = request.params;
      const body = request.body ?? {};

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access your own store data.',
            retryable: false,
          },
        });
      }

      // Validate action
      const { action } = body;
      if (!action || !['merge', 'reject'].includes(action)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: "action must be 'merge' or 'reject'.",
            retryable: false,
          },
        });
      }

      const client = await getStoreClient(fastify.pg, request.storeId);
      try {
        // Start transaction
        await client.query('BEGIN');

        // Find the duplicate candidate
        const candidateResult = await client.query(
          `SELECT id, store_id, product_a_id, product_b_id, status
           FROM duplicate_candidates
           WHERE id = $1 AND store_id = $2`,
          [duplicateId, id]
        );

        if (candidateResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Duplicate candidate not found.',
              retryable: false,
            },
          });
        }

        const candidate = candidateResult.rows[0];

        if (candidate.status !== 'pending') {
          await client.query('ROLLBACK');
          return reply.code(409).send({
            error: {
              code: 'ALREADY_RESOLVED',
              message: `This duplicate has already been resolved with status: ${candidate.status}.`,
              retryable: false,
            },
          });
        }

        if (action === 'merge') {
          const { product_a_id, product_b_id } = candidate;

          // Move sales records from product B to product A
          await client.query(
            `UPDATE sales_records SET product_id = $1 WHERE product_id = $2`,
            [product_a_id, product_b_id]
          );

          // Deactivate product B
          await client.query(
            `UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
            [product_b_id]
          );

          // Update the duplicate candidate status
          await client.query(
            `UPDATE duplicate_candidates SET status = 'merged', resolved_at = NOW() WHERE id = $1`,
            [duplicateId]
          );
        } else {
          // Reject: just update the status
          await client.query(
            `UPDATE duplicate_candidates SET status = 'rejected', resolved_at = NOW() WHERE id = $1`,
            [duplicateId]
          );
        }

        await client.query('COMMIT');

        return reply.code(200).send({
          message: `Duplicate ${action === 'merge' ? 'merged' : 'rejected'} successfully.`,
          duplicateId,
          action,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );
}
