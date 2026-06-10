/**
 * Reorder event subscriber.
 *
 * Subscribes to 'forecast.generated' events on the event bus and triggers
 * reorder calculations. Emits 'reorder.calculated' event upon completion.
 *
 * Validates: Requirements 8.1-8.6
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EventBus } from '../events/event-bus.js';
import type { SystemEvent } from '@grocery-intel/shared';
import { calculateReorderMetrics, getDefaultLeadTime } from './engine.js';
import type { ReorderInput } from './engine.js';
import { getStoreClient } from '../db/plugin.js';

export interface ReorderSubscriberOptions {
  pool: pg.Pool;
  eventBus: EventBus;
}

/**
 * Fetch product data needed for reorder calculations.
 */
async function fetchProductReorderData(
  pool: pg.Pool,
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

    return result.rows.map((row) => {
      const isLocal = isLocalSupplier(row.supplier_name);
      return {
        productId: row.product_id,
        productName: row.product_name,
        averageDailySales: parseFloat(row.avg_daily_sales) || 0,
        demandStdDev: parseFloat(row.demand_std_dev) || 0,
        currentStock: parseInt(row.estimated_stock, 10) || 0,
        isLocal,
        config: {
          leadTimeDays: row.configured_lead_time > 0 ? row.configured_lead_time : undefined,
          serviceLevel: row.configured_service_level > 0 ? row.configured_service_level : undefined,
          reviewPeriodDays: row.configured_review_period > 0 ? row.configured_review_period : undefined,
        },
      };
    });
  } finally {
    client.release();
  }
}

/**
 * Simple heuristic: supplier is "local" if name contains "local" or similar hints.
 * In production, this would use a database field.
 */
function isLocalSupplier(supplierName: string | null): boolean {
  if (!supplierName) return false;
  const lower = supplierName.toLowerCase();
  return lower.includes('local') || lower.includes('nearby') || lower.includes('regional');
}

/**
 * Store reorder calculation results in the database.
 */
async function storeReorderResults(
  pool: pg.Pool,
  storeId: string,
  results: ReturnType<typeof calculateReorderMetrics>[]
): Promise<void> {
  const client = await getStoreClient(pool, storeId);
  try {
    for (const result of results) {
      await client.query(
        `INSERT INTO reorder_configs
         (id, product_id, store_id, lead_time_days, service_level, review_period_days,
          reorder_point, safety_stock, suggested_order_qty, calculated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (product_id)
         DO UPDATE SET
           lead_time_days = EXCLUDED.lead_time_days,
           service_level = EXCLUDED.service_level,
           review_period_days = EXCLUDED.review_period_days,
           reorder_point = EXCLUDED.reorder_point,
           safety_stock = EXCLUDED.safety_stock,
           suggested_order_qty = EXCLUDED.suggested_order_qty,
           calculated_at = NOW()`,
        [
          randomUUID(),
          result.productId,
          storeId,
          result.leadTimeDays,
          result.serviceLevel,
          result.reviewPeriodDays,
          result.reorderPoint,
          result.safetyStock,
          result.suggestedOrderQty,
        ]
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Register the reorder subscriber on the event bus.
 * Listens for 'forecast.generated' events and triggers reorder calculations
 * for the affected store, then emits 'reorder.calculated'.
 */
export function registerReorderSubscriber(options: ReorderSubscriberOptions) {
  const { pool, eventBus } = options;

  const subscription = eventBus.subscribe('forecast.generated', async (event: SystemEvent) => {
    const { storeId, correlationId } = event;

    try {
      // Fetch product data for reorder calculations
      const productData = await fetchProductReorderData(pool, storeId);

      // Calculate reorder metrics for all products
      const results = productData.map((input) => calculateReorderMetrics(input));

      // Store results in database
      await storeReorderResults(pool, storeId, results);

      // Emit reorder.calculated event
      await eventBus.publish({
        type: 'reorder.calculated',
        storeId,
        pluginId: 'reorder-engine',
        payload: {
          productsCalculated: results.length,
          criticalCount: results.filter((r) => r.urgency === 'critical').length,
          highCount: results.filter((r) => r.urgency === 'high').length,
          triggeredBy: correlationId,
        },
        timestamp: new Date(),
        correlationId: randomUUID(),
      });
    } catch (error) {
      console.error(
        `[reorder] Failed to calculate reorder points for store ${storeId}:`,
        error
      );
    }
  });

  return subscription;
}
