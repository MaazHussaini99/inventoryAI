/**
 * Unit tests for recommendation engine.
 *
 * Tests pure functions for recommendation generation logic.
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect } from 'vitest';
import {
  generateRestockRecommendations,
  generateReduceRecommendations,
  generatePromoteRecommendations,
  generateAllRecommendations,
  calculateConfidence,
  generateExplanation,
  filterEligibleProducts,
} from './engine.js';
import type { ProductMetrics } from './engine.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductMetrics> = {}): ProductMetrics {
  return {
    productId: 'prod-1',
    productName: 'Test Product',
    estimatedStock: 50,
    averageDailyVelocity: 5,
    previousVelocity: 5,
    daysOfHistory: 30,
    daysOfSupply: 10,
    ...overrides,
  };
}

// ─── filterEligibleProducts ────────────────────────────────────────────────────

describe('filterEligibleProducts', () => {
  it('includes products with >= 14 days of history', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfHistory: 14 }),
      makeProduct({ productId: 'b', daysOfHistory: 30 }),
      makeProduct({ productId: 'c', daysOfHistory: 60 }),
    ];
    const result = filterEligibleProducts(products);
    expect(result).toHaveLength(3);
  });

  it('excludes products with < 14 days of history', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfHistory: 13 }),
      makeProduct({ productId: 'b', daysOfHistory: 7 }),
      makeProduct({ productId: 'c', daysOfHistory: 0 }),
    ];
    const result = filterEligibleProducts(products);
    expect(result).toHaveLength(0);
  });

  it('handles mixed eligibility', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfHistory: 14 }),
      makeProduct({ productId: 'b', daysOfHistory: 13 }),
      makeProduct({ productId: 'c', daysOfHistory: 15 }),
    ];
    const result = filterEligibleProducts(products);
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.productId)).toEqual(['a', 'c']);
  });
});

// ─── calculateConfidence ───────────────────────────────────────────────────────

describe('calculateConfidence', () => {
  it('returns "high" when >= 30 days and both velocities are positive', () => {
    const metrics = makeProduct({
      daysOfHistory: 30,
      averageDailyVelocity: 5,
      previousVelocity: 3,
    });
    expect(calculateConfidence(metrics)).toBe('high');
  });

  it('returns "medium" when < 30 days but has some velocity', () => {
    const metrics = makeProduct({
      daysOfHistory: 20,
      averageDailyVelocity: 5,
      previousVelocity: 0,
    });
    expect(calculateConfidence(metrics)).toBe('medium');
  });

  it('returns "low" when no velocity in either period', () => {
    const metrics = makeProduct({
      daysOfHistory: 14,
      averageDailyVelocity: 0,
      previousVelocity: 0,
    });
    expect(calculateConfidence(metrics)).toBe('low');
  });
});

// ─── generateExplanation ───────────────────────────────────────────────────────

describe('generateExplanation', () => {
  it('generates non-empty explanation for restock', () => {
    const metrics = makeProduct({ daysOfSupply: 3, averageDailyVelocity: 10 });
    const explanation = generateExplanation('restock', 'Milk', metrics);
    expect(explanation).toBeTruthy();
    expect(explanation.length).toBeGreaterThan(0);
    expect(explanation).toContain('Milk');
  });

  it('generates non-empty explanation for reduce', () => {
    const metrics = makeProduct({ averageDailyVelocity: 2, previousVelocity: 8 });
    const explanation = generateExplanation('reduce', 'Stale Bread', metrics);
    expect(explanation).toBeTruthy();
    expect(explanation).toContain('Stale Bread');
  });

  it('generates non-empty explanation for promote', () => {
    const metrics = makeProduct({ averageDailyVelocity: 10, previousVelocity: 3 });
    const explanation = generateExplanation('promote', 'Hot Sauce', metrics);
    expect(explanation).toBeTruthy();
    expect(explanation).toContain('Hot Sauce');
  });
});

// ─── generateRestockRecommendations ────────────────────────────────────────────

describe('generateRestockRecommendations', () => {
  it('returns products with daysOfSupply < 7', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfSupply: 3, daysOfHistory: 30, averageDailyVelocity: 5 }),
      makeProduct({ productId: 'b', daysOfSupply: 6, daysOfHistory: 30, averageDailyVelocity: 3 }),
      makeProduct({ productId: 'c', daysOfSupply: 10, daysOfHistory: 30, averageDailyVelocity: 2 }),
    ];
    const result = generateRestockRecommendations(products);
    expect(result).toHaveLength(2);
    expect(result[0].productId).toBe('a');
    expect(result[1].productId).toBe('b');
  });

  it('returns at most 10 items', () => {
    const products = Array.from({ length: 20 }, (_, i) =>
      makeProduct({
        productId: `p-${i}`,
        daysOfSupply: i * 0.3,
        daysOfHistory: 30,
        averageDailyVelocity: 5,
      })
    );
    const result = generateRestockRecommendations(products);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('sorts by days-of-supply ascending (most urgent first)', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfSupply: 5, daysOfHistory: 30, averageDailyVelocity: 5 }),
      makeProduct({ productId: 'b', daysOfSupply: 1, daysOfHistory: 30, averageDailyVelocity: 5 }),
      makeProduct({ productId: 'c', daysOfSupply: 3, daysOfHistory: 30, averageDailyVelocity: 5 }),
    ];
    const result = generateRestockRecommendations(products);
    expect(result[0].productId).toBe('b');
    expect(result[1].productId).toBe('c');
    expect(result[2].productId).toBe('a');
  });

  it('excludes products with < 14 days of history', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfSupply: 2, daysOfHistory: 10, averageDailyVelocity: 5 }),
      makeProduct({ productId: 'b', daysOfSupply: 2, daysOfHistory: 14, averageDailyVelocity: 5 }),
    ];
    const result = generateRestockRecommendations(products);
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe('b');
  });

  it('excludes products with zero velocity', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfSupply: 0, daysOfHistory: 30, averageDailyVelocity: 0 }),
    ];
    const result = generateRestockRecommendations(products);
    expect(result).toHaveLength(0);
  });

  it('each recommendation has type "restock"', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfSupply: 3, daysOfHistory: 30, averageDailyVelocity: 5 }),
    ];
    const result = generateRestockRecommendations(products);
    for (const rec of result) {
      expect(rec.type).toBe('restock');
    }
  });
});

// ─── generateReduceRecommendations ────────────────────────────────────────────

describe('generateReduceRecommendations', () => {
  it('returns products with declining velocity over 60 days', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 2, previousVelocity: 8, daysOfHistory: 60 }),
      makeProduct({ productId: 'b', averageDailyVelocity: 5, previousVelocity: 5, daysOfHistory: 60 }),
      makeProduct({ productId: 'c', averageDailyVelocity: 8, previousVelocity: 5, daysOfHistory: 60 }),
    ];
    const result = generateReduceRecommendations(products);
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe('a');
  });

  it('requires >= 60 days of history', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 2, previousVelocity: 8, daysOfHistory: 59 }),
      makeProduct({ productId: 'b', averageDailyVelocity: 2, previousVelocity: 8, daysOfHistory: 60 }),
    ];
    const result = generateReduceRecommendations(products);
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe('b');
  });

  it('returns at most 10 items', () => {
    const products = Array.from({ length: 20 }, (_, i) =>
      makeProduct({
        productId: `p-${i}`,
        averageDailyVelocity: 1,
        previousVelocity: 10 + i,
        daysOfHistory: 60,
      })
    );
    const result = generateReduceRecommendations(products);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('sorts by largest decline first', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 4, previousVelocity: 8, daysOfHistory: 60 }), // 50% decline
      makeProduct({ productId: 'b', averageDailyVelocity: 1, previousVelocity: 10, daysOfHistory: 60 }), // 90% decline
      makeProduct({ productId: 'c', averageDailyVelocity: 3, previousVelocity: 5, daysOfHistory: 60 }), // 40% decline
    ];
    const result = generateReduceRecommendations(products);
    expect(result[0].productId).toBe('b'); // 90% decline
    expect(result[1].productId).toBe('a'); // 50% decline
    expect(result[2].productId).toBe('c'); // 40% decline
  });

  it('each recommendation has type "reduce"', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 2, previousVelocity: 8, daysOfHistory: 60 }),
    ];
    const result = generateReduceRecommendations(products);
    for (const rec of result) {
      expect(rec.type).toBe('reduce');
    }
  });
});

// ─── generatePromoteRecommendations ────────────────────────────────────────────

describe('generatePromoteRecommendations', () => {
  it('returns products with rising velocity', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 10, previousVelocity: 5, daysOfHistory: 30 }),
      makeProduct({ productId: 'b', averageDailyVelocity: 5, previousVelocity: 10, daysOfHistory: 30 }),
      makeProduct({ productId: 'c', averageDailyVelocity: 8, previousVelocity: 3, daysOfHistory: 30 }),
    ];
    const result = generatePromoteRecommendations(products);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.productId).sort()).toEqual(['a', 'c']);
  });

  it('returns at most 5 items', () => {
    const products = Array.from({ length: 20 }, (_, i) =>
      makeProduct({
        productId: `p-${i}`,
        averageDailyVelocity: 10 + i,
        previousVelocity: 5,
        daysOfHistory: 30,
      })
    );
    const result = generatePromoteRecommendations(products);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('sorts by largest increase first', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 10, previousVelocity: 5, daysOfHistory: 30 }), // 100% increase
      makeProduct({ productId: 'b', averageDailyVelocity: 20, previousVelocity: 5, daysOfHistory: 30 }), // 300% increase
      makeProduct({ productId: 'c', averageDailyVelocity: 7, previousVelocity: 5, daysOfHistory: 30 }), // 40% increase
    ];
    const result = generatePromoteRecommendations(products);
    expect(result[0].productId).toBe('b'); // 300%
    expect(result[1].productId).toBe('a'); // 100%
    expect(result[2].productId).toBe('c'); // 40%
  });

  it('excludes products with < 14 days of history', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 10, previousVelocity: 5, daysOfHistory: 10 }),
    ];
    const result = generatePromoteRecommendations(products);
    expect(result).toHaveLength(0);
  });

  it('each recommendation has type "promote"', () => {
    const products = [
      makeProduct({ productId: 'a', averageDailyVelocity: 10, previousVelocity: 5, daysOfHistory: 30 }),
    ];
    const result = generatePromoteRecommendations(products);
    for (const rec of result) {
      expect(rec.type).toBe('promote');
    }
  });
});

// ─── generateAllRecommendations ────────────────────────────────────────────────

describe('generateAllRecommendations', () => {
  it('returns all three categories', () => {
    const products = [
      makeProduct({ productId: 'restock', daysOfSupply: 2, daysOfHistory: 60, averageDailyVelocity: 5, previousVelocity: 5 }),
      makeProduct({ productId: 'reduce', averageDailyVelocity: 1, previousVelocity: 10, daysOfHistory: 60, daysOfSupply: 20 }),
      makeProduct({ productId: 'promote', averageDailyVelocity: 10, previousVelocity: 3, daysOfHistory: 30, daysOfSupply: 20 }),
    ];
    const result = generateAllRecommendations(products);
    expect(result.restockNow.length).toBeGreaterThanOrEqual(1);
    expect(result.reduceOrRemove.length).toBeGreaterThanOrEqual(1);
    expect(result.promoteThisWeek.length).toBeGreaterThanOrEqual(1);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('all recommendations have valid confidence and non-empty explanation', () => {
    const products = [
      makeProduct({ productId: 'a', daysOfSupply: 2, daysOfHistory: 60, averageDailyVelocity: 5, previousVelocity: 10 }),
      makeProduct({ productId: 'b', averageDailyVelocity: 10, previousVelocity: 3, daysOfHistory: 30, daysOfSupply: 20 }),
    ];
    const result = generateAllRecommendations(products);
    const allRecs = [
      ...result.restockNow,
      ...result.reduceOrRemove,
      ...result.promoteThisWeek,
    ];
    for (const rec of allRecs) {
      expect(['low', 'medium', 'high']).toContain(rec.confidence);
      expect(rec.explanation.length).toBeGreaterThan(0);
    }
  });

  it('returns empty arrays when no products qualify', () => {
    const result = generateAllRecommendations([]);
    expect(result.restockNow).toHaveLength(0);
    expect(result.reduceOrRemove).toHaveLength(0);
    expect(result.promoteThisWeek).toHaveLength(0);
  });
});
