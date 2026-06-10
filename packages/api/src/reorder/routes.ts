/**
 * Reorder API Routes
 *
 * Provides endpoints for reorder point management:
 * - GET /api/stores/:id/reorder — Prioritized reorder list sorted by urgency
 * - PUT /api/stores/:id/products/:productId/reorder-config — Configure lead time, service level, review period
 *
 * Validates: Requirements 8.1, 8.3, 8.4, 8.5, 8.6
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { guardMiddleware } from '../auth/middleware.js';
import { getStoreClient } from '../db/plugin.js';
import { calculateReorderMetrics, sortByUrgency } from './engine.js';
import type { ReorderInput } from './engine.js';

interface StoreParams {
  id: string;
}

interface StoreProductParams {
  id: string;
  productId: string;
}

interface ReorderConfigBody {
  leadTimeDays?: number;
  serviceLevel?: number;
  reviewPeriodDays?: number;
}

/**
 * Simple heuristic: supplier is "local" if name contains "local" or similar hints.
 */
function isLocalSupplier(supplierName: string | null): boolean {
  if (!supplierName) return false;
  const lower = supplierName.toLowerCase();
  return lower.includes('local') || lower.includes('nearby') || lower.includes('regional');
}

/**
 * Fetch all product data needed for reorder calculations.
 */
async function fetchReorderData(
  pool: import('pg').Pool,
  storeId: string
): Promise<ReorderInput[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.estimated_stock,
        p.supplier_name,
        COALESCE(rc.lead_time_days, 0) AS configured_lead_time,
        COALESCE(rc.service_level, 0) AS configured_service_level,
        COALESCE(rc.review_period_days, 0) AS configured_review_period,
        COALESCE(stats.avg_daily, 0) AS avg_daily_sales,
        COALESCE(stats.std_dev, 0) AS demand_std_dev
      FROM products p
      LEFT JOIN reorder_configs rc ON rc.product_id = p.id AND rc.store_id = $1
      LEFT JOIN LATERAL (
        SELECT
          SUM(quantity_sold)::float / GREATEST(COUNT(DISTINCT sale_date), 1) AS avg_daily,
          COALESCE(STDDEV(daily_total), 0) AS std_dev
        FROM (
          SELECT sale_date, SUM(quantity_sold) AS daily_total
          FROM sales_records
          WHERE product_id = p.id AND store_id = $1
          GROUP BY sale_date
        ) daily
      ) stats ON TRUE
      WHERE p.store_id = $1 AND p.is_active = TRUE`,
      [storeId]
    );

    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      averageDailySales: parseFloat(row.avg_daily_sales) || 0,
      demandStdDev: parseFloat(row.demand_std_dev) || 0,
      currentStock: parseInt(row.estimated_stock, 10) || 0,
      isLocal: isLocalSupplier(row.supplier_name),
      config: {
        leadTimeDays: row.configured_lead_time > 0 ? row.configured_lead_time : undefined,
        serviceLevel: row.configured_service_level > 0 ? row.configured_service_level : undefined,
        reviewPeriodDays: row.configured_review_period > 0 ? row.configured_review_period : undefined,
      },
    }));
  } finally {
    client.release();
  }
}

export async function reorderRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:id/reorder
   * Returns prioritized reorder list sorted by urgency.
   */
  fastify.get<{ Params: StoreParams }>(
    '/api/stores/:id/reorder',
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
            message: 'You can only access reorder data for your own store.',
            retryable: false,
          },
        });
      }

      const productData = await fetchReorderData(fastify.pg, id);
      const results = productData.map((input) => calculateReorderMetrics(input));
      const sorted = sortByUrgency(results);

      return reply.code(200).send({
        storeId: id,
        items: sorted,
        summary: {
          total: sorted.length,
          critical: sorted.filter((r) => r.urgency === 'critical').length,
          high: sorted.filter((r) => r.urgency === 'high').length,
          medium: sorted.filter((r) => r.urgency === 'medium').length,
          low: sorted.filter((r) => r.urgency === 'low').length,
        },
        generatedAt: new Date().toISOString(),
      });
    }
  );

  /**
   * PUT /api/stores/:id/products/:productId/reorder-config
   * Configure lead time, service level, and review period for a product.
   */
  fastify.put<{ Params: StoreProductParams; Body: ReorderConfigBody }>(
    '/api/stores/:id/products/:productId/reorder-config',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreProductParams; Body: ReorderConfigBody }>,
      reply: FastifyReply
    ) => {
      const { id, productId } = request.params;
      const body = request.body as ReorderConfigBody;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only configure reorder settings for your own store.',
            retryable: false,
          },
        });
      }

      // Validate inputs
      if (body.leadTimeDays !== undefined && (body.leadTimeDays < 1 || body.leadTimeDays > 90)) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_LEAD_TIME',
            message: 'Lead time must be between 1 and 90 days.',
            retryable: false,
          },
        });
      }

      if (body.serviceLevel !== undefined && (body.serviceLevel < 0.5 || body.serviceLevel > 0.99)) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_SERVICE_LEVEL',
            message: 'Service level must be between 0.5 and 0.99.',
            retryable: false,
          },
        });
      }

      if (body.reviewPeriodDays !== undefined && (body.reviewPeriodDays < 1 || body.reviewPeriodDays > 30)) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_REVIEW_PERIOD',
            message: 'Review period must be between 1 and 30 days.',
            retryable: false,
          },
        });
      }

      // Check product exists
      const client = await getStoreClient(fastify.pg, id);
      try {
        const productResult = await client.query(
          `SELECT id FROM products WHERE id = $1 AND store_id = $2`,
          [productId, id]
        );
        if (productResult.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'Product not found in this store.',
              retryable: false,
            },
          });
        }

        // Upsert reorder config
        await client.query(
          `INSERT INTO reorder_configs
           (id, product_id, store_id, lead_time_days, service_level, review_period_days,
            reorder_point, safety_stock, suggested_order_qty, calculated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, NOW())
           ON CONFLICT (product_id)
           DO UPDATE SET
             lead_time_days = COALESCE($4, reorder_configs.lead_time_days),
             service_level = COALESCE($5, reorder_configs.service_level),
             review_period_days = COALESCE($6, reorder_configs.review_period_days),
             calculated_at = NOW()`,
          [
            randomUUID(),
            productId,
            id,
            body.leadTimeDays ?? null,
            body.serviceLevel ?? null,
            body.reviewPeriodDays ?? null,
          ]
        );

        return reply.code(200).send({
          success: true,
          productId,
          config: {
            leadTimeDays: body.leadTimeDays,
            serviceLevel: body.serviceLevel,
            reviewPeriodDays: body.reviewPeriodDays,
          },
        });
      } finally {
        client.release();
      }
    }
  );
}
