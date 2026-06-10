/**
 * Recommendations event subscriber.
 *
 * Subscribes to 'analytics.updated' events on the event bus and triggers
 * recommendation generation. Emits 'recommendations.ready' event upon completion.
 *
 * Validates: Requirements 6.6
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EventBus } from '../events/event-bus.js';
import type { SystemEvent } from '@grocery-intel/shared';
import { generateAllRecommendations } from './engine.js';
import type { ProductMetrics } from './engine.js';
import { getStoreClient } from '../db/plugin.js';

export interface RecommendationsSubscriberOptions {
  pool: pg.Pool;
  eventBus: EventBus;
}

/**
 * Fetch product metrics from the database for recommendation generation.
 * Calculates velocity from last 30 days vs previous 30 days (days 31-60).
 */
async function fetchProductMetrics(
  pool: pg.Pool,
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
        COALESCE(recent.days_count, 0) AS recent_days,
        COALESCE(prev.total_qty, 0) AS prev_qty,
        COALESCE(prev.days_count, 0) AS prev_days,
        (SELECT COUNT(DISTINCT sale_date)
         FROM sales_records
         WHERE product_id = p.id AND store_id = $1) AS total_days_of_history
      FROM products p
      LEFT JOIN LATERAL (
        SELECT SUM(quantity_sold) AS total_qty, COUNT(DISTINCT sale_date) AS days_count
        FROM sales_records
        WHERE product_id = p.id AND store_id = $1
          AND sale_date >= $2::date AND sale_date < $3::date
      ) recent ON TRUE
      LEFT JOIN LATERAL (
        SELECT SUM(quantity_sold) AS total_qty, COUNT(DISTINCT sale_date) AS days_count
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

      // Calculate average daily velocity: total units / 30 days
      const averageDailyVelocity = recentQty / 30;
      const previousVelocity = prevQty / 30;

      // Calculate days of supply
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
 * Register the recommendations subscriber on the event bus.
 * Listens for 'analytics.updated' events and triggers recommendation generation
 * for the affected store, then emits 'recommendations.ready'.
 */
export function registerRecommendationsSubscriber(options: RecommendationsSubscriberOptions) {
  const { pool, eventBus } = options;

  const subscription = eventBus.subscribe('analytics.updated', async (event: SystemEvent) => {
    const { storeId, correlationId } = event;

    try {
      // Fetch product metrics from the database
      const metrics = await fetchProductMetrics(pool, storeId);

      // Generate recommendations
      const recommendations = generateAllRecommendations(metrics);

      // Emit recommendations.ready event
      await eventBus.publish({
        type: 'recommendations.ready',
        storeId,
        pluginId: 'ai-recommendations',
        payload: {
          restockCount: recommendations.restockNow.length,
          reduceCount: recommendations.reduceOrRemove.length,
          promoteCount: recommendations.promoteThisWeek.length,
          generatedAt: recommendations.generatedAt.toISOString(),
          triggeredBy: correlationId,
        },
        timestamp: new Date(),
        correlationId: randomUUID(),
      });
    } catch (error) {
      // Log but don't throw — event handler errors are isolated
      console.error(
        `[recommendations] Failed to generate recommendations for store ${storeId}:`,
        error
      );
    }
  });

  return subscription;
}

export { fetchProductMetrics };
