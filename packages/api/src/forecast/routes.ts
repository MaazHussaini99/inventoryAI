/**
 * Forecast API Routes
 *
 * Provides endpoints for demand forecasting:
 * - GET /api/stores/:id/products/:productId/forecast — Returns predictions with confidence intervals
 *
 * Validates: Requirements 7.1, 7.3, 7.4, 7.5
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { guardMiddleware } from '../auth/middleware.js';
import { getStoreClient } from '../db/plugin.js';
import { generateForecast } from './engine.js';
import type { HistoryPoint, Horizon } from './engine.js';

interface StoreProductParams {
  id: string;
  productId: string;
}

interface ForecastQuerystring {
  horizon?: string;
}

/**
 * Fetch sales history for a product.
 */
async function fetchProductHistory(
  pool: import('pg').Pool,
  storeId: string,
  productId: string
): Promise<HistoryPoint[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT sale_date, SUM(quantity_sold) AS total_qty
       FROM sales_records
       WHERE store_id = $1 AND product_id = $2
       GROUP BY sale_date
       ORDER BY sale_date ASC`,
      [storeId, productId]
    );
    return result.rows.map((row) => ({
      date: new Date(row.sale_date),
      quantity: parseInt(row.total_qty, 10) || 0,
    }));
  } finally {
    client.release();
  }
}

/**
 * Get category average daily sales for limited-data estimates.
 */
async function getCategoryAverage(
  pool: import('pg').Pool,
  storeId: string,
  productId: string
): Promise<number> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT AVG(daily_qty) AS avg_daily
       FROM (
         SELECT p2.id, SUM(sr.quantity_sold)::float / GREATEST(COUNT(DISTINCT sr.sale_date), 1) AS daily_qty
         FROM products p2
         JOIN sales_records sr ON sr.product_id = p2.id AND sr.store_id = $1
         WHERE p2.store_id = $1 AND p2.category = (
           SELECT category FROM products WHERE id = $2 AND store_id = $1
         )
         GROUP BY p2.id
       ) sub`,
      [storeId, productId]
    );
    return parseFloat(result.rows[0]?.avg_daily) || 0;
  } finally {
    client.release();
  }
}

/**
 * Fetch stored forecast records from the database.
 */
async function fetchStoredForecast(
  pool: import('pg').Pool,
  storeId: string,
  productId: string
): Promise<Array<{
  forecast_date: string;
  expected_demand: number;
  low_demand: number;
  high_demand: number;
  method: string;
  data_quality: string;
  horizon_days: number;
  generated_at: string;
}> | null> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT forecast_date, expected_demand, low_demand, high_demand, method, data_quality, horizon_days, generated_at
       FROM forecast_records
       WHERE store_id = $1 AND product_id = $2
       ORDER BY forecast_date ASC`,
      [storeId, productId]
    );
    return result.rows.length > 0 ? result.rows : null;
  } finally {
    client.release();
  }
}

export async function forecastRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:id/products/:productId/forecast
   * Returns forecast predictions with confidence intervals.
   */
  fastify.get<{ Params: StoreProductParams; Querystring: ForecastQuerystring }>(
    '/api/stores/:id/products/:productId/forecast',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreProductParams; Querystring: ForecastQuerystring }>,
      reply: FastifyReply
    ) => {
      const { id, productId } = request.params;
      const horizon = (parseInt(request.query.horizon ?? '7', 10) === 14 ? 14 : 7) as Horizon;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access forecasts for your own store.',
            retryable: false,
          },
        });
      }

      // Check product exists and belongs to store
      const client = await getStoreClient(fastify.pg, id);
      let productExists: boolean;
      try {
        const result = await client.query(
          `SELECT id FROM products WHERE id = $1 AND store_id = $2`,
          [productId, id]
        );
        productExists = result.rows.length > 0;
      } finally {
        client.release();
      }

      if (!productExists) {
        return reply.code(404).send({
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Product not found in this store.',
            retryable: false,
          },
        });
      }

      // Try to return stored forecast first
      const storedForecast = await fetchStoredForecast(fastify.pg, id, productId);

      if (storedForecast && storedForecast.length > 0) {
        return reply.code(200).send({
          productId,
          horizon: storedForecast[0].horizon_days,
          method: storedForecast[0].method,
          dataQuality: storedForecast[0].data_quality,
          generatedAt: storedForecast[0].generated_at,
          predictions: storedForecast.map((row) => ({
            date: row.forecast_date,
            expected: parseFloat(String(row.expected_demand)),
            low: parseFloat(String(row.low_demand)),
            high: parseFloat(String(row.high_demand)),
          })),
        });
      }

      // Generate forecast on-the-fly
      const history = await fetchProductHistory(fastify.pg, id, productId);
      const categoryAvg = await getCategoryAverage(fastify.pg, id, productId);
      const forecast = generateForecast(history, horizon, categoryAvg);

      return reply.code(200).send({
        productId,
        horizon: forecast.horizon,
        method: forecast.method,
        dataQuality: forecast.dataQuality,
        generatedAt: new Date().toISOString(),
        predictions: forecast.predictions.map((p) => ({
          date: p.date.toISOString().split('T')[0],
          expected: p.expected,
          low: p.low,
          high: p.high,
        })),
      });
    }
  );
}
