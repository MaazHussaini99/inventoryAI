/**
 * Recommendations API Routes
 *
 * Provides endpoints for AI-powered recommendations:
 * - GET /api/stores/:id/recommendations — All three recommendation categories
 * - POST /api/stores/:id/recommendations/generate — Manual trigger for generation
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { guardMiddleware } from '../auth/middleware.js';
import { getStoreClient } from '../db/plugin.js';
import { generateAllRecommendations } from './engine.js';
import type { ProductMetrics } from './engine.js';

interface StoreParams {
  id: string;
}

/**
 * Fetch product metrics from the database for recommendation generation.
 */
async function fetchProductMetrics(
  pool: import('pg').Pool,
  storeId: string
): Promise<ProductMetrics[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const result = await client.query(
      `SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.estimated_stock,
        COALESCE(recent.total_qty, 0) AS recent_qty,
        COALESCE(prev.total_qty, 0) AS prev_qty,
        (SELECT COUNT(DISTINCT sale_date)
         FROM sales_records
         WHERE product_id = p.id AND store_id = $1) AS total_days_of_history
      FROM products p
      LEFT JOIN LATERAL (
        SELECT SUM(quantity_sold) AS total_qty
        FROM sales_records
        WHERE product_id = p.id AND store_id = $1
          AND sale_date >= $2::date AND sale_date < $3::date
      ) recent ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(quantity_sold) AS total_qty
        FROM sales_records
        WHERE product_id = p.id AND store_id = $1
          AND sale_date >= $4::date AND sale_date < $2::date
      ) prev ON TRUE
      WHERE p.store_id = $1 AND p.is_active = TRUE`,
      [
        storeId,
        thirtyDaysAgo.toISOString().split('T')[0],
        now.toISOString().split('T')[0],
        sixtyDaysAgo.toISOString().split('T')[0],
      ]
    );

    return result.rows.map((row) => {
      const estimatedStock = parseInt(row.estimated_stock, 10) || 0;
      const recentQty = parseInt(row.recent_qty, 10) || 0;
      const prevQty = parseInt(row.prev_qty, 10) || 0;
      const daysOfHistory = parseInt(row.total_days_of_history, 10) || 0;

      const averageDailyVelocity = recentQty / 30;
      const previousVelocity = prevQty / 30;

      const daysOfSupply = averageDailyVelocity > 0
        ? estimatedStock / averageDailyVelocity
        : estimatedStock > 0 ? Infinity : 0;

      return {
        productId: row.product_id,
        productName: row.product_name,
        estimatedStock,
        averageDailyVelocity,
        previousVelocity,
        daysOfHistory,
        daysOfSupply,
      };
    });
  } finally {
    client.release();
  }
}

/**
 * Check if a store has sufficient data (>= 14 days of any sales history).
 */
async function getStoreDataDays(
  pool: import('pg').Pool,
  storeId: string
): Promise<number> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT COUNT(DISTINCT sale_date) AS days_count
       FROM sales_records
       WHERE store_id = $1`,
      [storeId]
    );
    return parseInt(result.rows[0]?.days_count ?? '0', 10);
  } finally {
    client.release();
  }
}

export async function recommendationsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:id/recommendations
   * Returns all three recommendation categories.
   */
  fastify.get<{ Params: StoreParams }>(
    '/api/stores/:id/recommendations',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access recommendations for your own store.',
            retryable: false,
          },
        });
      }

      // Check data sufficiency
      const dataDays = await getStoreDataDays(fastify.pg, id);
      if (dataDays < 14) {
        return reply.code(200).send({
          insufficientData: true,
          message: `Your store has ${dataDays} days of sales data. At least 14 days of history are needed for AI recommendations.`,
          progress: Math.round((dataDays / 14) * 100),
          recommendations: null,
        });
      }

      // Generate recommendations
      const metrics = await fetchProductMetrics(fastify.pg, id);
      const recommendations = generateAllRecommendations(metrics);

      return reply.code(200).send({
        insufficientData: false,
        recommendations: {
          restockNow: recommendations.restockNow,
          reduceOrRemove: recommendations.reduceOrRemove,
          promoteThisWeek: recommendations.promoteThisWeek,
          generatedAt: recommendations.generatedAt.toISOString(),
        },
      });
    }
  );

  /**
   * POST /api/stores/:id/recommendations/generate
   * Manual trigger for recommendation generation. Emits recommendations.ready event.
   */
  fastify.post<{ Params: StoreParams }>(
    '/api/stores/:id/recommendations/generate',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only generate recommendations for your own store.',
            retryable: false,
          },
        });
      }

      // Check data sufficiency
      const dataDays = await getStoreDataDays(fastify.pg, id);
      if (dataDays < 14) {
        return reply.code(200).send({
          insufficientData: true,
          message: `Your store has ${dataDays} days of sales data. At least 14 days of history are needed for AI recommendations.`,
          progress: Math.round((dataDays / 14) * 100),
          recommendations: null,
        });
      }

      // Generate recommendations
      const metrics = await fetchProductMetrics(fastify.pg, id);
      const recommendations = generateAllRecommendations(metrics);

      // Emit recommendations.ready event if event bus is available
      if (fastify.eventBus) {
        await fastify.eventBus.publish({
          type: 'recommendations.ready',
          storeId: id,
          pluginId: 'ai-recommendations',
          payload: {
            restockCount: recommendations.restockNow.length,
            reduceCount: recommendations.reduceOrRemove.length,
            promoteCount: recommendations.promoteThisWeek.length,
            generatedAt: recommendations.generatedAt.toISOString(),
            trigger: 'manual',
          },
          timestamp: new Date(),
          correlationId: randomUUID(),
        });
      }

      return reply.code(200).send({
        insufficientData: false,
        recommendations: {
          restockNow: recommendations.restockNow,
          reduceOrRemove: recommendations.reduceOrRemove,
          promoteThisWeek: recommendations.promoteThisWeek,
          generatedAt: recommendations.generatedAt.toISOString(),
        },
      });
    }
  );
}
