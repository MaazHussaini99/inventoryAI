/**
 * Feature: grocery-inventory-intelligence
 *
 * Property-based tests for AI recommendations:
 * - Property 12: Restock Recommendations Selection (Validates: Requirements 6.1)
 * - Property 13: Reduce/Remove Recommendations Selection (Validates: Requirements 6.2)
 * - Property 14: Promote Recommendations Selection (Validates: Requirements 6.3)
 * - Property 15: Recommendation Structural Invariants (Validates: Requirements 6.4, 6.5)
 *
 * These test pure computation logic using in-memory helper functions.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateRestockRecommendations,
  generateReduceRecommendations,
  generatePromoteRecommendations,
  generateAllRecommendations,
  filterEligibleProducts,
} from './engine.js';
import type { ProductMetrics } from './engine.js';

// ─── Arbitraries ───────────────────────────────────────────────────────────────

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

/** Generate product metrics with configurable constraints */
const productMetricsArb: fc.Arbitrary<ProductMetrics> = fc.record({
  productId: productIdArb,
  productName: productNameArb,
  estimatedStock: fc.integer({ min: 0, max: 1000 }),
  averageDailyVelocity: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
  previousVelocity: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
  daysOfHistory: fc.integer({ min: 0, max: 120 }),
  daysOfSupply: fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
});

/** Generate a list of product metrics with unique IDs */
const productMetricsListArb: fc.Arbitrary<ProductMetrics[]> = fc
  .array(productMetricsArb, { minLength: 0, maxLength: 30 })
  .map((products) => {
    const seen = new Map<string, ProductMetrics>();
    for (const p of products) {
      seen.set(p.productId, p);
    }
    return Array.from(seen.values());
  });

/** Generate product metrics eligible for restock (low days-of-supply, positive velocity, >= 14 days history) */
const restockEligibleArb: fc.Arbitrary<ProductMetrics> = fc.record({
  productId: productIdArb,
  productName: productNameArb,
  estimatedStock: fc.integer({ min: 1, max: 100 }),
  averageDailyVelocity: fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true }),
  previousVelocity: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
  daysOfHistory: fc.integer({ min: 14, max: 120 }),
  daysOfSupply: fc.double({ min: 0, max: 6.99, noNaN: true, noDefaultInfinity: true }),
});

/** Generate product metrics with declining velocity (for reduce recommendations) */
const reduceEligibleArb: fc.Arbitrary<ProductMetrics> = fc
  .record({
    productId: productIdArb,
    productName: productNameArb,
    estimatedStock: fc.integer({ min: 0, max: 1000 }),
    previousVelocity: fc.double({ min: 1, max: 50, noNaN: true, noDefaultInfinity: true }),
    daysOfHistory: fc.integer({ min: 60, max: 120 }),
    daysOfSupply: fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
  })
  .chain((base) =>
    fc.double({ min: 0, max: base.previousVelocity * 0.99, noNaN: true, noDefaultInfinity: true }).map(
      (avgVelocity) => ({
        ...base,
        averageDailyVelocity: avgVelocity,
      })
    )
  );

/** Generate product metrics with rising velocity (for promote recommendations) */
const promoteEligibleArb: fc.Arbitrary<ProductMetrics> = fc
  .record({
    productId: productIdArb,
    productName: productNameArb,
    estimatedStock: fc.integer({ min: 0, max: 1000 }),
    previousVelocity: fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true }),
    daysOfHistory: fc.integer({ min: 14, max: 120 }),
    daysOfSupply: fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
  })
  .chain((base) =>
    fc.double({ min: base.previousVelocity + 0.01, max: 50, noNaN: true, noDefaultInfinity: true }).map(
      (avgVelocity) => ({
        ...base,
        averageDailyVelocity: avgVelocity,
      })
    )
  );

// ─── Property 12: Restock Recommendations Selection ────────────────────────────

describe('Property 12: Restock Recommendations Selection', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any set of products with velocity and stock data, the "Restock Now"
   * recommendation list should:
   * (a) contain at most 10 items
   * (b) only include products where estimated days-of-supply is critically low
   * (c) no excluded product with lower days-of-supply than any included product should exist
   */

  it('(a) contains at most 10 items', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateRestockRecommendations(products);
        expect(result.length).toBeLessThanOrEqual(10);
      }),
      { numRuns: 100 }
    );
  });

  it('(b) only includes products with critically low days-of-supply (< 7)', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateRestockRecommendations(products);
        for (const rec of result) {
          const original = products.find((p) => p.productId === rec.productId);
          expect(original).toBeDefined();
          expect(original!.daysOfSupply).toBeLessThan(7);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('(c) no excluded product with lower days-of-supply than any included product', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateRestockRecommendations(products);
        if (result.length === 0) return;

        const includedIds = new Set(result.map((r) => r.productId));
        const highestIncludedDos = Math.max(
          ...result.map((r) => {
            const p = products.find((prod) => prod.productId === r.productId)!;
            return p.daysOfSupply;
          })
        );

        // Eligible excluded products should not have lower days-of-supply than the highest included
        const eligible = filterEligibleProducts(products);
        for (const p of eligible) {
          if (
            !includedIds.has(p.productId) &&
            p.daysOfSupply < 7 &&
            p.averageDailyVelocity > 0
          ) {
            expect(p.daysOfSupply).toBeGreaterThanOrEqual(highestIncludedDos);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 13: Reduce/Remove Recommendations Selection ──────────────────────

describe('Property 13: Reduce/Remove Recommendations Selection', () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any set of products with 60-day sales history, the "Reduce or Remove"
   * recommendation list should:
   * (a) contain at most 10 items
   * (b) only include products with a declining sales velocity trend over the past 60 days
   */

  it('(a) contains at most 10 items', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateReduceRecommendations(products);
        expect(result.length).toBeLessThanOrEqual(10);
      }),
      { numRuns: 100 }
    );
  });

  it('(b) only includes products with declining sales velocity over 60 days', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateReduceRecommendations(products);
        for (const rec of result) {
          const original = products.find((p) => p.productId === rec.productId);
          expect(original).toBeDefined();
          // Must have declining velocity
          expect(original!.averageDailyVelocity).toBeLessThan(original!.previousVelocity);
          // Must have >= 60 days of history
          expect(original!.daysOfHistory).toBeGreaterThanOrEqual(60);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 14: Promote Recommendations Selection ────────────────────────────

describe('Property 14: Promote Recommendations Selection', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any set of products with recent sales data, the "Promote This Week"
   * recommendation list should:
   * (a) contain at most 5 items
   * (b) only include products with a rising sales velocity
   */

  it('(a) contains at most 5 items', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generatePromoteRecommendations(products);
        expect(result.length).toBeLessThanOrEqual(5);
      }),
      { numRuns: 100 }
    );
  });

  it('(b) only includes products with rising velocity', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generatePromoteRecommendations(products);
        for (const rec of result) {
          const original = products.find((p) => p.productId === rec.productId);
          expect(original).toBeDefined();
          // Must have rising velocity (current > previous)
          expect(original!.averageDailyVelocity).toBeGreaterThan(original!.previousVelocity);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 15: Recommendation Structural Invariants ─────────────────────────

describe('Property 15: Recommendation Structural Invariants', () => {
  /**
   * **Validates: Requirements 6.4, 6.5**
   *
   * For any generated recommendation (restock, reduce, or promote), the
   * recommendation should have:
   * (a) a confidence value in {low, medium, high}
   * (b) a non-empty explanation string
   * (c) only reference SKUs with at least 14 days of sales history
   */

  it('(a) confidence is always in {low, medium, high}', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateAllRecommendations(products);
        const allRecs = [
          ...result.restockNow,
          ...result.reduceOrRemove,
          ...result.promoteThisWeek,
        ];
        for (const rec of allRecs) {
          expect(['low', 'medium', 'high']).toContain(rec.confidence);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('(b) explanation is always non-empty', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateAllRecommendations(products);
        const allRecs = [
          ...result.restockNow,
          ...result.reduceOrRemove,
          ...result.promoteThisWeek,
        ];
        for (const rec of allRecs) {
          expect(rec.explanation.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('(c) only SKUs with >= 14 days of history are included', () => {
    fc.assert(
      fc.property(productMetricsListArb, (products) => {
        const result = generateAllRecommendations(products);
        const allRecs = [
          ...result.restockNow,
          ...result.reduceOrRemove,
          ...result.promoteThisWeek,
        ];
        for (const rec of allRecs) {
          const original = products.find((p) => p.productId === rec.productId);
          expect(original).toBeDefined();
          expect(original!.daysOfHistory).toBeGreaterThanOrEqual(14);
        }
      }),
      { numRuns: 100 }
    );
  });
});
