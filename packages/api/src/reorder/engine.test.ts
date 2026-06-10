/**
 * Unit tests for Reorder Calculation Engine
 *
 * Tests specific examples and edge cases for:
 * - getDefaultLeadTime
 * - calculateSafetyStock
 * - calculateReorderPoint
 * - calculateOrderQuantity
 * - calculateDaysUntilStockout
 * - calculateReorderMetrics
 * - sortByUrgency
 * - zScore
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultLeadTime,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateOrderQuantity,
  calculateDaysUntilStockout,
  calculateReorderMetrics,
  sortByUrgency,
  determineUrgency,
  zScore,
} from './engine.js';
import type { ReorderInput } from './engine.js';

// ─── getDefaultLeadTime ────────────────────────────────────────────────────────

describe('getDefaultLeadTime', () => {
  it('returns 3 for local suppliers', () => {
    expect(getDefaultLeadTime(true)).toBe(3);
  });

  it('returns 7 for non-local suppliers', () => {
    expect(getDefaultLeadTime(false)).toBe(7);
  });
});

// ─── zScore ────────────────────────────────────────────────────────────────────

describe('zScore', () => {
  it('returns approximately 1.645 for service level 0.95', () => {
    expect(zScore(0.95)).toBeCloseTo(1.645, 1);
  });

  it('returns approximately 1.28 for service level 0.90', () => {
    expect(zScore(0.90)).toBeCloseTo(1.28, 1);
  });

  it('returns approximately 2.33 for service level 0.99', () => {
    expect(zScore(0.99)).toBeCloseTo(2.33, 1);
  });
});

// ─── calculateSafetyStock ──────────────────────────────────────────────────────

describe('calculateSafetyStock', () => {
  it('returns 0 when demand std dev is 0', () => {
    expect(calculateSafetyStock(0, 7, 0.95)).toBe(0);
  });

  it('returns 0 when lead time is 0', () => {
    expect(calculateSafetyStock(5, 0, 0.95)).toBe(0);
  });

  it('calculates correctly for known values', () => {
    // z(0.95) ≈ 1.645, std_dev = 5, lead_time = 4
    // safety_stock = 1.645 * 5 * sqrt(4) = 1.645 * 5 * 2 = 16.45
    const result = calculateSafetyStock(5, 4, 0.95);
    expect(result).toBeCloseTo(16.45, 0);
  });

  it('increases with lead time', () => {
    const short = calculateSafetyStock(5, 3, 0.95);
    const long = calculateSafetyStock(5, 7, 0.95);
    expect(long).toBeGreaterThan(short);
  });

  it('increases with service level', () => {
    const low = calculateSafetyStock(5, 7, 0.90);
    const high = calculateSafetyStock(5, 7, 0.99);
    expect(high).toBeGreaterThan(low);
  });
});

// ─── calculateReorderPoint ─────────────────────────────────────────────────────

describe('calculateReorderPoint', () => {
  it('returns safety stock when avg daily sales is 0', () => {
    expect(calculateReorderPoint(0, 7, 10)).toBe(10);
  });

  it('calculates correctly: avg_daily * lead_time + safety_stock', () => {
    // 10 * 5 + 20 = 70
    expect(calculateReorderPoint(10, 5, 20)).toBe(70);
  });
});

// ─── calculateOrderQuantity ────────────────────────────────────────────────────

describe('calculateOrderQuantity', () => {
  it('calculates correctly: avg_daily * (lead + review) - stock + safety', () => {
    // 10 * (5 + 7) - 50 + 20 = 120 - 50 + 20 = 90
    expect(calculateOrderQuantity(10, 5, 7, 50, 20)).toBe(90);
  });

  it('returns 0 when stock exceeds demand projection', () => {
    // 5 * (3 + 7) - 100 + 10 = 50 - 100 + 10 = -40 → max(0, -40) = 0
    expect(calculateOrderQuantity(5, 3, 7, 100, 10)).toBe(0);
  });

  it('returns positive when stock is low', () => {
    // 10 * (3 + 7) - 5 + 15 = 100 - 5 + 15 = 110
    expect(calculateOrderQuantity(10, 3, 7, 5, 15)).toBe(110);
  });
});

// ─── calculateDaysUntilStockout ────────────────────────────────────────────────

describe('calculateDaysUntilStockout', () => {
  it('returns null when avg daily sales is 0 and stock > 0', () => {
    expect(calculateDaysUntilStockout(100, 0)).toBeNull();
  });

  it('returns 0 when stock is 0 and no sales', () => {
    expect(calculateDaysUntilStockout(0, 0)).toBe(0);
  });

  it('calculates correctly: stock / avg_daily', () => {
    expect(calculateDaysUntilStockout(100, 10)).toBe(10);
  });

  it('handles fractional days', () => {
    expect(calculateDaysUntilStockout(5, 3)).toBeCloseTo(1.667, 2);
  });

  it('returns 0 when stock is 0', () => {
    expect(calculateDaysUntilStockout(0, 10)).toBe(0);
  });
});

// ─── determineUrgency ──────────────────────────────────────────────────────────

describe('determineUrgency', () => {
  it('returns low for null daysUntilStockout', () => {
    expect(determineUrgency(null)).toBe('low');
  });

  it('returns critical for 0 days', () => {
    expect(determineUrgency(0)).toBe('critical');
  });

  it('returns critical for 2 days', () => {
    expect(determineUrgency(2)).toBe('critical');
  });

  it('returns high for 3 days', () => {
    expect(determineUrgency(3)).toBe('high');
  });

  it('returns high for 5 days', () => {
    expect(determineUrgency(5)).toBe('high');
  });

  it('returns medium for 6 days', () => {
    expect(determineUrgency(6)).toBe('medium');
  });

  it('returns medium for 10 days', () => {
    expect(determineUrgency(10)).toBe('medium');
  });

  it('returns low for 11 days', () => {
    expect(determineUrgency(11)).toBe('low');
  });
});

// ─── calculateReorderMetrics ───────────────────────────────────────────────────

describe('calculateReorderMetrics', () => {
  it('uses default lead time for local supplier', () => {
    const input: ReorderInput = {
      productId: 'p1',
      productName: 'Milk',
      averageDailySales: 10,
      demandStdDev: 3,
      currentStock: 50,
      isLocal: true,
    };
    const result = calculateReorderMetrics(input);
    expect(result.leadTimeDays).toBe(3);
  });

  it('uses default lead time for non-local supplier', () => {
    const input: ReorderInput = {
      productId: 'p2',
      productName: 'Rice',
      averageDailySales: 5,
      demandStdDev: 2,
      currentStock: 20,
      isLocal: false,
    };
    const result = calculateReorderMetrics(input);
    expect(result.leadTimeDays).toBe(7);
  });

  it('uses configured lead time when provided', () => {
    const input: ReorderInput = {
      productId: 'p3',
      productName: 'Bread',
      averageDailySales: 8,
      demandStdDev: 2,
      currentStock: 30,
      isLocal: true,
      config: { leadTimeDays: 5 },
    };
    const result = calculateReorderMetrics(input);
    expect(result.leadTimeDays).toBe(5);
  });

  it('calculates reorder point correctly', () => {
    const input: ReorderInput = {
      productId: 'p4',
      productName: 'Eggs',
      averageDailySales: 10,
      demandStdDev: 0, // Zero std dev = no safety stock
      currentStock: 50,
      isLocal: true,
      config: { leadTimeDays: 3, serviceLevel: 0.95, reviewPeriodDays: 7 },
    };
    const result = calculateReorderMetrics(input);
    // reorder_point = 10 * 3 + 0 = 30
    expect(result.reorderPoint).toBe(30);
    expect(result.safetyStock).toBe(0);
  });
});

// ─── sortByUrgency ─────────────────────────────────────────────────────────────

describe('sortByUrgency', () => {
  it('sorts by ascending days until stockout', () => {
    const results = [
      { ...makeResult('A'), daysUntilStockout: 10 },
      { ...makeResult('B'), daysUntilStockout: 2 },
      { ...makeResult('C'), daysUntilStockout: 5 },
    ];
    const sorted = sortByUrgency(results);
    expect(sorted[0].productId).toBe('B');
    expect(sorted[1].productId).toBe('C');
    expect(sorted[2].productId).toBe('A');
  });

  it('puts null daysUntilStockout last', () => {
    const results = [
      { ...makeResult('A'), daysUntilStockout: null },
      { ...makeResult('B'), daysUntilStockout: 3 },
      { ...makeResult('C'), daysUntilStockout: null },
    ];
    const sorted = sortByUrgency(results);
    expect(sorted[0].productId).toBe('B');
    expect(sorted[1].daysUntilStockout).toBeNull();
    expect(sorted[2].daysUntilStockout).toBeNull();
  });

  it('handles empty array', () => {
    expect(sortByUrgency([])).toHaveLength(0);
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeResult(id: string) {
  return {
    productId: id,
    productName: `Product ${id}`,
    reorderPoint: 50,
    safetyStock: 10,
    suggestedOrderQty: 100,
    leadTimeDays: 7,
    serviceLevel: 0.95,
    reviewPeriodDays: 7,
    averageDailySales: 10,
    currentStock: 30,
    daysUntilStockout: 3 as number | null,
    urgency: 'high' as const,
  };
}
