/**
 * Inventory Calculation Engine
 *
 * Calculates estimated current stock levels and classifies inventory status.
 * - estimated_stock = products.estimated_stock (updated during import)
 * - Status classification based on reorder_point from reorder_configs (default 10)
 * - Creates InventorySnapshot records on each calculation
 * - Flags negative inventory as data discrepancy
 *
 * Validates: Requirements 5.1, 5.2, 5.5
 */

import type pg from 'pg';
import { getStoreClient } from '../db/plugin.js';

export type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface InventoryItem {
  productId: string;
  productName: string;
  skuIdentifier: string | null;
  category: string | null;
  estimatedStock: number;
  reorderPoint: number;
  status: InventoryStatus;
  hasDiscrepancy: boolean;
}

/**
 * Classify inventory status based on estimated stock and reorder point.
 *
 * - "in_stock": estimatedStock > reorderPoint
 * - "low_stock": 0 < estimatedStock <= reorderPoint
 * - "out_of_stock": estimatedStock <= 0
 */
export function classifyStatus(estimatedStock: number, reorderPoint: number): InventoryStatus {
  if (estimatedStock <= 0) {
    return 'out_of_stock';
  }
  if (estimatedStock <= reorderPoint) {
    return 'low_stock';
  }
  return 'in_stock';
}

const DEFAULT_REORDER_POINT = 10;

/**
 * Calculate inventory status for all active products in a store.
 *
 * For MVP: uses products.estimated_stock directly (updated during import),
 * classifies based on reorder_point from reorder_configs (default 10 if not configured).
 * Creates InventorySnapshot records for each calculated product.
 * Flags negative inventory as data discrepancy.
 */
export async function calculateInventoryStatus(
  pool: pg.Pool,
  storeId: string
): Promise<InventoryItem[]> {
  const client = await getStoreClient(pool, storeId);
  try {
    // Fetch all active products with their reorder configs (if any)
    const result = await client.query(
      `SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.sku_identifier,
        p.category,
        p.estimated_stock,
        COALESCE(rc.reorder_point, $1) AS reorder_point
      FROM products p
      LEFT JOIN reorder_configs rc ON rc.product_id = p.id AND rc.store_id = p.store_id
      WHERE p.store_id = $2 AND p.is_active = TRUE
      ORDER BY p.name ASC`,
      [DEFAULT_REORDER_POINT, storeId]
    );

    const items: InventoryItem[] = [];

    for (const row of result.rows) {
      const estimatedStock = parseInt(row.estimated_stock, 10);
      const reorderPoint = parseFloat(row.reorder_point);
      const status = classifyStatus(estimatedStock, reorderPoint);
      const hasDiscrepancy = estimatedStock < 0;

      items.push({
        productId: row.product_id,
        productName: row.product_name,
        skuIdentifier: row.sku_identifier,
        category: row.category,
        estimatedStock,
        reorderPoint,
        status,
        hasDiscrepancy,
      });
    }

    // Create InventorySnapshot records for each calculated product
    if (items.length > 0) {
      const values: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      for (const item of items) {
        values.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, 'calculated', NOW())`
        );
        params.push(item.productId, storeId, item.estimatedStock);
        paramIndex += 3;
      }

      await client.query(
        `INSERT INTO inventory_snapshots (product_id, store_id, quantity, source, recorded_at)
         VALUES ${values.join(', ')}`,
        params
      );
    }

    return items;
  } finally {
    client.release();
  }
}
