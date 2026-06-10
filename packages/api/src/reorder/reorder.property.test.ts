/**
 * Feature: grocery-inventory-intelligence
 *
 * Property-based tests for Reorder Calculation Engine:
 * - Property 19: Reorder Point and Safety Stock Calculation (Validates: Requirements 8.1, 8.2)
 * - Property 20: Default Lead Time Assignment (Validates: Requirements 8.4)
 * - Property 21: Order Quantity Calculation (Validates: Requirements 8.5)
 * - Property 22: Reorder List Urgency Sorting (Validates: Requirements 8.6)
 *
 * These test pure computation logic using in-memory helper functions.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getDefaultLeadTime,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateOrderQuantity,
  calculateDaysUntilStockout,
  calculateReorderMetrics,
  sortByUrgency,
  zScore,
} from './engine.js';
import type { ReorderInput, ReorderResult } from './engine.js';

// ─── Arbitraries ───────────────────────────────────────────────────────────────

/** Average daily sales */
const avgDailyArb: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 100,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Demand standard deviation */
const stdDevArb: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 50,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Lead time in days */
const leadTimeArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 30 });

/** Service level */
const serviceLevelArb: fc.Arbitrary<number> = fc.double({
  min: 0.5,
  max: 0.99,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Review period in days */
const reviewPeriodArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 30 });

/** Current stock */
const stockArb: fc.Arbitrary<number> = fc.integer({ min: 0, max: 1000 });

/** Boolean for isLocal */
const isLocalArb: fc.Arbitrary<boolean> = fc.boolean();

/** Generate a product ID */
const productIdArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
  { minLength: 4, maxLength: 8 }
).map((s) => `prod-${s}`);

/** Generate a product name */
const productNameArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom('A', 'B', 'C', 'D', 'E', 'a', 'b', 'c', 'd', 'e', ' '),
  { minLength: 3, maxLength: 20 }
).filter((s) => s.trim().length >= 3);

/** Generate a ReorderResult for sorting tests */
const reorderResultArb: fc.Arbitrary<ReorderResult> = fc.record({
  productId: productIdArb,
  productName: productNameArb,
  reorderPoint: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
  safetyStock: fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
  suggestedOrderQty: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  leadTimeDays: leadTimeArb,
  serviceLevel: serviceLevelArb,
  reviewPeriodDays: reviewPeriodArb,
  averageDailySales: avgDailyArb,
  currentStock: stockArb,
  daysUntilStockout: fc.oneof(
    fc.constant(null),
    fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })
  ),
  urgency: fc.constantFrom('critical' as const, 'high' as const, 'medium' as const, 'low' as const),
});

/** Generate a list of ReorderResults with unique IDs */
const reorderResultListArb: fc.Arbitrary<ReorderResult[]> = fc
  .array(reorderResultArb, { minLength: 0, maxLength: 20 })
  .map((results) => {
    const seen = new Map<string, ReorderResult>();
    for (const r of results) {
      seen.set(r.productId, r);
    }
    return Array.from(seen.values());
  });

// ─── Property 19: Reorder Point and Safety Stock Calculation ───────────────────

describe('Property 19: Reorder Point and Safety Stock Calculation', () => {
  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * For any product with known average daily sales, lead time, demand standard
   * deviation, and service level:
   * - reorder_point = (average_daily_sales × lead_time_days) + safety_stock
   * - safety_stock = z_score(service_level) × demand_std_dev × sqrt(lead_time_days)
   */

  it('safety_stock = z_score(service_level) × demand_std_dev × sqrt(lead_time_days)', () => {
    fc.assert(
      fc.property(stdDevArb, leadTimeArb, serviceLevelArb, (stdDev, leadTime, serviceLevel) => {
        const result = calculateSafetyStock(stdDev, leadTime, serviceLevel);
        const expected = zScore(serviceLevel) * stdDev * Math.sqrt(leadTime);
        expect(result).toBeCloseTo(expected, 8);
      }),
      { numRuns: 100 }
    );
  });

  it('reorder_point = (avg_daily × lead_time) + safety_stock', () => {
    fc.assert(
      fc.property(avgDailyArb, leadTimeArb, stdDevArb, serviceLevelArb, (avgDaily, leadTime, stdDev, serviceLevel) => {
        const safetyStock = calculateSafetyStock(stdDev, leadTime, serviceLevel);
        const reorderPoint = calculateReorderPoint(avgDaily, leadTime, safetyStock);
        const expected = avgDaily * leadTime + safetyStock;
        expect(reorderPoint).toBeCloseTo(expected, 8);
      }),
      { numRuns: 100 }
    );
  });

  it('calculateReorderMetrics produces consistent reorder point', () => {
    fc.assert(
      fc.property(
        avgDailyArb, stdDevArb, stockArb, isLocalArb, leadTimeArb, serviceLevelArb,
        (avgDaily, stdDev, stock, isLocal, leadTime, serviceLevel) => {
          const input: ReorderInput = {
            productId: 'test-prod',
            productName: 'Test Product',
            averageDailySales: avgDaily,
            demandStdDev: stdDev,
            currentStock: stock,
            isLocal,
            config: { leadTimeDays: leadTime, serviceLevel },
          };
          const result = calculateReorderMetrics(input);

          // Verify the relationship
          const expectedSafety = zScore(serviceLevel) * stdDev * Math.sqrt(leadTime);
          const expectedReorder = avgDaily * leadTime + expectedSafety;

          expect(result.safetyStock).toBeCloseTo(Math.round(expectedSafety * 100) / 100, 2);
          expect(result.reorderPoint).toBeCloseTo(Math.round(expectedReorder * 100) / 100, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 20: Default Lead Time Assignment ─────────────────────────────────

describe('Property 20: Default Lead Time Assignment', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any product without an explicitly configured lead time, the system should
   * assign a default of 3 days if the supplier is local, or 7 days if non-local.
   */

  it('returns 3 days for local suppliers', () => {
    fc.assert(
      fc.property(fc.constant(true), (isLocal) => {
        expect(getDefaultLeadTime(isLocal)).toBe(3);
      }),
      { numRuns: 100 }
    );
  });

  it('returns 7 days for non-local suppliers', () => {
    fc.assert(
      fc.property(fc.constant(false), (isLocal) => {
        expect(getDefaultLeadTime(isLocal)).toBe(7);
      }),
      { numRuns: 100 }
    );
  });

  it('calculateReorderMetrics uses default lead time when not configured', () => {
    fc.assert(
      fc.property(
        avgDailyArb, stdDevArb, stockArb, isLocalArb,
        (avgDaily, stdDev, stock, isLocal) => {
          const input: ReorderInput = {
            productId: 'test-prod',
            productName: 'Test Product',
            averageDailySales: avgDaily,
            demandStdDev: stdDev,
            currentStock: stock,
            isLocal,
            // No config.leadTimeDays
          };
          const result = calculateReorderMetrics(input);
          const expectedLeadTime = isLocal ? 3 : 7;
          expect(result.leadTimeDays).toBe(expectedLeadTime);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 21: Order Quantity Calculation ───────────────────────────────────

describe('Property 21: Order Quantity Calculation', () => {
  /**
   * **Validates: Requirements 8.5**
   *
   * For any product with known average daily sales, lead time, and review period,
   * the suggested order quantity should equal:
   * avg_daily × (lead_time + review_period) - current_stock + safety_stock
   * (clamped to minimum 0)
   */

  it('qty = avg_daily × (lead_time + review_period) - current_stock + safety_stock (min 0)', () => {
    fc.assert(
      fc.property(
        avgDailyArb, leadTimeArb, reviewPeriodArb, stockArb, stdDevArb, serviceLevelArb,
        (avgDaily, leadTime, reviewPeriod, stock, stdDev, serviceLevel) => {
          const safetyStock = calculateSafetyStock(stdDev, leadTime, serviceLevel);
          const result = calculateOrderQuantity(avgDaily, leadTime, reviewPeriod, stock, safetyStock);
          const expected = Math.max(
            0,
            avgDaily * (leadTime + reviewPeriod) - stock + safetyStock
          );
          expect(result).toBeCloseTo(expected, 8);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('order quantity is always non-negative', () => {
    fc.assert(
      fc.property(
        avgDailyArb, leadTimeArb, reviewPeriodArb, stockArb, stdDevArb, serviceLevelArb,
        (avgDaily, leadTime, reviewPeriod, stock, stdDev, serviceLevel) => {
          const safetyStock = calculateSafetyStock(stdDev, leadTime, serviceLevel);
          const result = calculateOrderQuantity(avgDaily, leadTime, reviewPeriod, stock, safetyStock);
          expect(result).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 22: Reorder List Urgency Sorting ─────────────────────────────────

describe('Property 22: Reorder List Urgency Sorting', () => {
  /**
   * **Validates: Requirements 8.6**
   *
   * For any list of reorder recommendations, the list should be sorted in
   * ascending order of estimated days until stockout (most urgent first).
   * Items with null daysUntilStockout go last.
   */

  it('sorted list is in ascending order of daysUntilStockout', () => {
    fc.assert(
      fc.property(reorderResultListArb, (results) => {
        const sorted = sortByUrgency(results);

        for (let i = 0; i < sorted.length - 1; i++) {
          const a = sorted[i].daysUntilStockout;
          const b = sorted[i + 1].daysUntilStockout;

          // null goes last
          if (a === null) {
            expect(b).toBeNull();
          } else if (b !== null) {
            expect(a).toBeLessThanOrEqual(b);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('preserves all elements (no items lost or duplicated)', () => {
    fc.assert(
      fc.property(reorderResultListArb, (results) => {
        const sorted = sortByUrgency(results);
        expect(sorted).toHaveLength(results.length);

        const sortedIds = sorted.map((r) => r.productId).sort();
        const originalIds = [...results].map((r) => r.productId).sort();
        expect(sortedIds).toEqual(originalIds);
      }),
      { numRuns: 100 }
    );
  });
});
