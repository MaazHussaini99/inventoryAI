/**
 * Forecast event subscriber.
 *
 * Subscribes to 'data.normalized' events on the event bus and triggers
 * forecast generation. Emits 'forecast.generated' event upon completion.
 *
 * Validates: Requirements 7.1, 7.2
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EventBus } from '../events/event-bus.js';
import type { SystemEvent } from '@grocery-intel/shared';
import { generateForecast } from './engine.js';
import type { HistoryPoint, Horizon } from './engine.js';
import { getStoreClient } from '../db/plugin.js';

export interface ForecastSubscriberOptions {
  pool: pg.Pool;
  eventBus: EventBus;
}

/**
 * Fetch sales history for a product from the database.
 */
async function fetchProductHistory(
  pool: pg.Pool,
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
  pool: pg.Pool,
  storeId: string,
  category: string | null
): Promise<number> {
  if (!category) return 0;

  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT AVG(daily_qty) AS avg_daily
       FROM (
         SELECT p.id, SUM(sr.quantity_sold)::float / GREATEST(COUNT(DISTINCT sr.sale_date), 1) AS daily_qty
         FROM products p
         JOIN sales_records sr ON sr.product_id = p.id AND sr.store_id = $1
         WHERE p.store_id = $1 AND p.category = $2
         GROUP BY p.id
       ) sub`,
      [storeId, category]
    );
    return parseFloat(result.rows[0]?.avg_daily) || 0;
  } finally {
    client.release();
  }
}

/**
 * Store forecast records in the database.
 */
async function storeForecastRecords(
  pool: pg.Pool,
  storeId: string,
  productId: string,
  forecast: ReturnType<typeof generateForecast>
): Promise<void> {
  const client = await getStoreClient(pool, storeId);
  try {
    // Remove existing forecast records for this product
    await client.query(
      `DELETE FROM forecast_records WHERE store_id = $1 AND product_id = $2`,
      [storeId, productId]
    );

    // Insert new forecast records
    for (const prediction of forecast.predictions) {
      await client.query(
        `INSERT INTO forecast_records
         (id, product_id, store_id, forecast_date, horizon_days, expected_demand, low_demand, high_demand, method, data_quality, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          randomUUID(),
          productId,
          storeId,
          prediction.date.toISOString().split('T')[0],
          forecast.horizon,
          prediction.expected,
          prediction.low,
          prediction.high,
          forecast.method,
          forecast.dataQuality,
        ]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Register the forecast subscriber on the event bus.
 * Listens for 'data.normalized' events and triggers forecast generation
 * for all active products in the store, then emits 'forecast.generated'.
 */
export function registerForecastSubscriber(options: ForecastSubscriberOptions) {
  const { pool, eventBus } = options;

  const subscription = eventBus.subscribe('data.normalized', async (event: SystemEvent) => {
    const { storeId, correlationId } = event;

    try {
      // Get all active products for the store
      const client = await getStoreClient(pool, storeId);
      let products: Array<{ id: string; category: string | null }>;
      try {
        const result = await client.query(
          `SELECT id, category FROM products WHERE store_id = $1 AND is_active = TRUE`,
          [storeId]
        );
        products = result.rows;
      } finally {
        client.release();
      }

      const horizon: Horizon = 7;
      let forecastCount = 0;

      for (const product of products) {
        const history = await fetchProductHistory(pool, storeId, product.id);
        const categoryAvg = await getCategoryAverage(pool, storeId, product.category);
        const forecast = generateForecast(history, horizon, categoryAvg);

        await storeForecastRecords(pool, storeId, product.id, forecast);
        forecastCount++;
      }

      // Emit forecast.generated event
      await eventBus.publish({
        type: 'forecast.generated',
        storeId,
        pluginId: 'forecast-engine',
        payload: {
          productsForecasted: forecastCount,
          horizon,
          triggeredBy: correlationId,
        },
        timestamp: new Date(),
        correlationId: randomUUID(),
      });
    } catch (error) {
      console.error(
        `[forecast] Failed to generate forecasts for store ${storeId}:`,
        error
      );
    }
  });

  return subscription;
}
