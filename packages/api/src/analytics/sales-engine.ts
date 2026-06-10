/**
 * Sales Intelligence Engine
 *
 * Provides on-demand analytics calculations for store sales data including:
 * - Daily analytics aggregations (revenue, units, avg transaction value, unique SKUs)
 * - Top product rankings by revenue or units sold
 * - Dead stock identification (zero sales in past N days)
 * - Daily sales trends with day-of-week patterns
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6
 */

import type pg from 'pg';
import { getStoreClient } from '../db/plugin.js';

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface DateRange {
  startDate: string; // ISO date string YYYY-MM-DD
  endDate: string;   // ISO date string YYYY-MM-DD
}

export interface DailyAnalytics {
  date: string;
  totalRevenue: number;
  totalUnitsSold: number;
  averageTransactionValue: number;
  uniqueSkusSold: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalRevenue: number;
  totalUnitsSold: number;
  rank: number;
}

export interface DeadStockItem {
  productId: string;
  productName: string;
  lastSaleDate: string | null;
  estimatedStock: number;
  daysSinceLastSale: number;
}

export interface DailyTrend {
  date: string;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  revenue: number;
  unitsSold: number;
}

export type SortBy = 'revenue' | 'units';

// ─── Analytics Functions ───────────────────────────────────────────────────────

/**
 * Calculate daily analytics for a store within a date range.
 * Returns total revenue, units sold, average transaction value, and unique SKUs per day.
 */
export async function calculateDailyAnalytics(
  pool: pg.Pool,
  storeId: string,
  dateRange: DateRange
): Promise<DailyAnalytics[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT
        sale_date::text AS date,
        COALESCE(SUM(quantity_sold * sale_price), 0) AS total_revenue,
        COALESCE(SUM(quantity_sold), 0) AS total_units_sold,
        CASE
          WHEN COUNT(*) > 0 THEN COALESCE(SUM(quantity_sold * sale_price) / COUNT(*), 0)
          ELSE 0
        END AS average_transaction_value,
        COUNT(DISTINCT product_id) AS unique_skus_sold
      FROM sales_records
      WHERE store_id = $1
        AND sale_date >= $2::date
        AND sale_date <= $3::date
      GROUP BY sale_date
      ORDER BY sale_date ASC`,
      [storeId, dateRange.startDate, dateRange.endDate]
    );

    return result.rows.map((row) => ({
      date: row.date,
      totalRevenue: parseFloat(row.total_revenue),
      totalUnitsSold: parseInt(row.total_units_sold, 10),
      averageTransactionValue: parseFloat(row.average_transaction_value),
      uniqueSkusSold: parseInt(row.unique_skus_sold, 10),
    }));
  } finally {
    client.release();
  }
}

/**
 * Get top products ranked by revenue or units sold.
 * Returns up to `limit` products (default 20) sorted in descending order.
 */
export async function getTopProducts(
  pool: pg.Pool,
  storeId: string,
  dateRange: DateRange,
  sortBy: SortBy = 'revenue',
  limit: number = 20
): Promise<TopProduct[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    const orderColumn = sortBy === 'revenue'
      ? 'total_revenue'
      : 'total_units_sold';

    const result = await client.query(
      `SELECT
        sr.product_id,
        p.name AS product_name,
        COALESCE(SUM(sr.quantity_sold * sr.sale_price), 0) AS total_revenue,
        COALESCE(SUM(sr.quantity_sold), 0) AS total_units_sold
      FROM sales_records sr
      JOIN products p ON p.id = sr.product_id
      WHERE sr.store_id = $1
        AND sr.sale_date >= $2::date
        AND sr.sale_date <= $3::date
      GROUP BY sr.product_id, p.name
      ORDER BY ${orderColumn} DESC
      LIMIT $4`,
      [storeId, dateRange.startDate, dateRange.endDate, limit]
    );

    return result.rows.map((row, index) => ({
      productId: row.product_id,
      productName: row.product_name,
      totalRevenue: parseFloat(row.total_revenue),
      totalUnitsSold: parseInt(row.total_units_sold, 10),
      rank: index + 1,
    }));
  } finally {
    client.release();
  }
}

/**
 * Identify dead stock products - items with zero sales in the past N days.
 * Sorted by last sale date ascending (longest without a sale first).
 */
export async function getDeadStock(
  pool: pg.Pool,
  storeId: string,
  daysThreshold: number = 30
): Promise<DeadStockItem[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.last_sale_date::text AS last_sale_date,
        p.estimated_stock,
        CASE
          WHEN p.last_sale_date IS NULL THEN $2
          ELSE EXTRACT(DAY FROM (CURRENT_DATE - p.last_sale_date::date))::int
        END AS days_since_last_sale
      FROM products p
      WHERE p.store_id = $1
        AND p.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM sales_records sr
          WHERE sr.product_id = p.id
            AND sr.store_id = $1
            AND sr.sale_date >= (CURRENT_DATE - $2 * INTERVAL '1 day')
        )
      ORDER BY p.last_sale_date ASC NULLS FIRST`,
      [storeId, daysThreshold]
    );

    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      lastSaleDate: row.last_sale_date ?? null,
      estimatedStock: parseInt(row.estimated_stock, 10),
      daysSinceLastSale: parseInt(row.days_since_last_sale, 10),
    }));
  } finally {
    client.release();
  }
}

/**
 * Get daily sales trends with day-of-week information.
 * Used to identify patterns like weekend spikes or weekday slumps.
 */
export async function getDailyTrends(
  pool: pg.Pool,
  storeId: string,
  dateRange: DateRange
): Promise<DailyTrend[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    const result = await client.query(
      `SELECT
        sale_date::text AS date,
        EXTRACT(DOW FROM sale_date)::int AS day_of_week,
        COALESCE(SUM(quantity_sold * sale_price), 0) AS revenue,
        COALESCE(SUM(quantity_sold), 0) AS units_sold
      FROM sales_records
      WHERE store_id = $1
        AND sale_date >= $2::date
        AND sale_date <= $3::date
      GROUP BY sale_date
      ORDER BY sale_date ASC`,
      [storeId, dateRange.startDate, dateRange.endDate]
    );

    return result.rows.map((row) => ({
      date: row.date,
      dayOfWeek: parseInt(row.day_of_week, 10),
      revenue: parseFloat(row.revenue),
      unitsSold: parseInt(row.units_sold, 10),
    }));
  } finally {
    client.release();
  }
}
