/**
 * Sales Analytics API Routes
 *
 * Provides endpoints for sales analytics dashboard:
 * - GET /api/stores/:id/analytics/summary — Sales summary with date range filter
 * - GET /api/stores/:id/analytics/top-products — Top products by revenue or units
 * - GET /api/stores/:id/analytics/dead-stock — Dead stock items
 * - GET /api/stores/:id/analytics/trends — Daily trend data for charts
 * - GET /api/stores/:id/products/:productId — SKU detail view
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { guardMiddleware } from '../auth/middleware.js';
import { getStoreClient } from '../db/plugin.js';
import {
  calculateDailyAnalytics,
  getTopProducts,
  getDeadStock,
  getDailyTrends,
} from './sales-engine.js';
import type { SortBy } from './sales-engine.js';

interface StoreParams {
  id: string;
}

interface ProductParams {
  id: string;
  productId: string;
}

interface SummaryQuery {
  range?: 'today' | '7d' | '30d' | 'custom';
  startDate?: string;
  endDate?: string;
}

interface TopProductsQuery {
  sort?: 'revenue' | 'units';
  limit?: string;
}

interface TrendsQuery {
  startDate?: string;
  endDate?: string;
}

/**
 * Calculate date range based on the range filter parameter.
 */
function getDateRange(range?: string, startDate?: string, endDate?: string): { startDate: string; endDate: string } {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  switch (range) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case '7d': {
      const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString().split('T')[0], endDate: todayStr };
    }
    case 'custom':
      if (startDate && endDate) {
        return { startDate, endDate };
      }
      // Fall through to default 30d
      break;
    case '30d':
    default: {
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString().split('T')[0], endDate: todayStr };
    }
  }

  // Default to 30 days
  const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString().split('T')[0], endDate: todayStr };
}

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:id/analytics/summary
   * Returns aggregated sales summary for the selected date range.
   */
  fastify.get<{ Params: StoreParams; Querystring: SummaryQuery }>(
    '/api/stores/:id/analytics/summary',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams; Querystring: SummaryQuery }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access analytics for your own store.',
            retryable: false,
          },
        });
      }

      const { range, startDate, endDate } = request.query;
      const dateRange = getDateRange(range, startDate, endDate);

      const dailyAnalytics = await calculateDailyAnalytics(
        fastify.pg,
        id,
        dateRange
      );

      // Aggregate daily analytics into a summary
      const totalRevenue = dailyAnalytics.reduce((sum, d) => sum + d.totalRevenue, 0);
      const totalUnits = dailyAnalytics.reduce((sum, d) => sum + d.totalUnitsSold, 0);
      const uniqueSkus = dailyAnalytics.reduce((max, d) => Math.max(max, d.uniqueSkusSold), 0);
      const avgTransaction = dailyAnalytics.length > 0
        ? totalRevenue / dailyAnalytics.reduce((sum, d) => sum + (d.totalRevenue > 0 ? 1 : 0), 0) || 0
        : 0;

      return reply.code(200).send({
        summary: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalUnits,
          averageTransactionValue: Math.round(avgTransaction * 100) / 100,
          uniqueSkus,
          dateRange,
          daysWithData: dailyAnalytics.length,
        },
      });
    }
  );

  /**
   * GET /api/stores/:id/analytics/top-products
   * Returns top products ranked by revenue or units sold.
   */
  fastify.get<{ Params: StoreParams; Querystring: TopProductsQuery }>(
    '/api/stores/:id/analytics/top-products',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams; Querystring: TopProductsQuery }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access analytics for your own store.',
            retryable: false,
          },
        });
      }

      const sort: SortBy = request.query.sort === 'units' ? 'units' : 'revenue';
      const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 20);

      // Default to last 30 days
      const dateRange = getDateRange('30d');

      const topProducts = await getTopProducts(fastify.pg, id, dateRange, sort, limit);

      return reply.code(200).send({
        topProducts,
        sortBy: sort,
        dateRange,
      });
    }
  );

  /**
   * GET /api/stores/:id/analytics/dead-stock
   * Returns products with zero sales in the past 30 days.
   */
  fastify.get<{ Params: StoreParams }>(
    '/api/stores/:id/analytics/dead-stock',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access analytics for your own store.',
            retryable: false,
          },
        });
      }

      const deadStock = await getDeadStock(fastify.pg, id, 30);

      return reply.code(200).send({
        deadStock,
        daysThreshold: 30,
      });
    }
  );

  /**
   * GET /api/stores/:id/analytics/trends
   * Returns daily chart data (revenue + units) with day-of-week info.
   */
  fastify.get<{ Params: StoreParams; Querystring: TrendsQuery }>(
    '/api/stores/:id/analytics/trends',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams; Querystring: TrendsQuery }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access analytics for your own store.',
            retryable: false,
          },
        });
      }

      const { startDate, endDate } = request.query;
      const dateRange = getDateRange('30d', startDate, endDate);
      if (startDate && endDate) {
        dateRange.startDate = startDate;
        dateRange.endDate = endDate;
      }

      const trends = await getDailyTrends(fastify.pg, id, dateRange);

      return reply.code(200).send({
        trends,
        dateRange,
      });
    }
  );

  /**
   * GET /api/stores/:id/products/:productId
   * Returns SKU detail view with daily history, velocity, revenue, and estimated stock.
   */
  fastify.get<{ Params: ProductParams }>(
    '/api/stores/:id/products/:productId',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: ProductParams }>,
      reply: FastifyReply
    ) => {
      const { id, productId } = request.params;

      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access products from your own store.',
            retryable: false,
          },
        });
      }

      const client = await getStoreClient(fastify.pg, id);
      try {
        // Fetch product info
        const productResult = await client.query(
          `SELECT id, name, sku_identifier, category, supplier_name, is_active, estimated_stock, last_sale_date, created_at
           FROM products
           WHERE id = $1 AND store_id = $2`,
          [productId, id]
        );

        if (productResult.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'Product not found.',
              retryable: false,
            },
          });
        }

        const product = productResult.rows[0];

        // Fetch daily sales history for the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];
        const today = new Date().toISOString().split('T')[0];

        const salesResult = await client.query(
          `SELECT
            sale_date::text AS date,
            SUM(quantity_sold) AS units_sold,
            SUM(quantity_sold * sale_price) AS revenue
          FROM sales_records
          WHERE product_id = $1 AND store_id = $2 AND sale_date >= $3::date
          GROUP BY sale_date
          ORDER BY sale_date ASC`,
          [productId, id, thirtyDaysAgo]
        );

        const dailyHistory = salesResult.rows.map((row) => ({
          date: row.date,
          unitsSold: parseInt(row.units_sold, 10),
          revenue: parseFloat(row.revenue),
        }));

        // Calculate velocity (average daily units sold over last 30 days)
        const totalUnitsSold = dailyHistory.reduce((sum, d) => sum + d.unitsSold, 0);
        const totalRevenue = dailyHistory.reduce((sum, d) => sum + d.revenue, 0);
        const daysWithData = dailyHistory.length;
        const averageDailyVelocity = daysWithData > 0
          ? Math.round((totalUnitsSold / 30) * 100) / 100
          : 0;

        return reply.code(200).send({
          product: {
            id: product.id,
            name: product.name,
            skuIdentifier: product.sku_identifier,
            category: product.category,
            supplierName: product.supplier_name,
            isActive: product.is_active,
            estimatedStock: parseInt(product.estimated_stock, 10),
            lastSaleDate: product.last_sale_date?.toISOString?.()?.split('T')[0] ?? product.last_sale_date ?? null,
            createdAt: product.created_at,
          },
          analytics: {
            dailyHistory,
            totalUnitsSold,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            averageDailyVelocity,
            dateRange: { startDate: thirtyDaysAgo, endDate: today },
          },
        });
      } finally {
        client.release();
      }
    }
  );
}
