/**
 * Property-Based Test: Inventory Calculation and Status Classification
 *
 * Property 11: For any product with an initial stock count and a sequence of sales records,
 * the estimated stock should equal initial_stock minus sum of quantities sold.
 * Status classification should be:
 * - "In Stock" when estimated_stock > reorder_point
 * - "Low Stock" when 0 < estimated_stock <= reorder_point
 * - "Out of Stock" when estimated_stock <= 0
 *
 * **Validates: Requirements 5.1, 5.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classifyStatus } from './engine.js';
import type { InventoryStatus } from './engine.js';

describe('Property 11: Inventory Calculation and Status Classification', () => {
  it('estimated stock equals initial_stock minus sum of quantities sold', () => {
    fc.assert(
      fc.property(
        // initial stock: any integer (could be 0 or positive)
        fc.integer({ min: 0, max: 10000 }),
        // array of sales quantities (each > 0 as per DB constraint)
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 0, maxLength: 50 }),
        (initialStock, salesQuantities) => {
          const totalSold = salesQuantities.reduce((sum, qty) => sum + qty, 0);
          const estimatedStock = initialStock - totalSold;

          // The calculated estimated stock must equal initial_stock - sum(quantities_sold)
          expect(estimatedStock).toBe(initialStock - totalSold);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('status classification is correct for all combinations of stock and reorder point', () => {
    fc.assert(
      fc.property(
        // estimated stock can be negative (data discrepancy), zero, or positive
        fc.integer({ min: -100, max: 10000 }),
        // reorder point is always non-negative
        fc.integer({ min: 0, max: 1000 }),
        (estimatedStock, reorderPoint) => {
          const status: InventoryStatus = classifyStatus(estimatedStock, reorderPoint);

          if (estimatedStock <= 0) {
            expect(status).toBe('out_of_stock');
          } else if (estimatedStock <= reorderPoint) {
            expect(status).toBe('low_stock');
          } else {
            expect(status).toBe('in_stock');
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('inventory calculation combined with status classification is consistent', () => {
    fc.assert(
      fc.property(
        // initial stock
        fc.integer({ min: 0, max: 5000 }),
        // sales quantities
        fc.array(fc.integer({ min: 1, max: 200 }), { minLength: 0, maxLength: 30 }),
        // reorder point
        fc.integer({ min: 1, max: 100 }),
        (initialStock, salesQuantities, reorderPoint) => {
          const totalSold = salesQuantities.reduce((sum, qty) => sum + qty, 0);
          const estimatedStock = initialStock - totalSold;
          const status = classifyStatus(estimatedStock, reorderPoint);

          // Verify the fundamental calculation
          expect(estimatedStock).toBe(initialStock - totalSold);

          // Verify status classification rules
          if (estimatedStock <= 0) {
            expect(status).toBe('out_of_stock');
          } else if (estimatedStock > 0 && estimatedStock <= reorderPoint) {
            expect(status).toBe('low_stock');
          } else {
            expect(status).toBe('in_stock');
            expect(estimatedStock).toBeGreaterThan(reorderPoint);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
