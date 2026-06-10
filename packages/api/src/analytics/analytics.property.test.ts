/**
 * Feature: grocery-inventory-intelligence
 *
 * Property-based tests for sales analytics:
 * - Property 8: Sales Summary Aggregation (Validates: Requirements 4.1)
 * - Property 9: Top-N Product Ranking (Validates: Requirements 4.2)
 * - Property 10: Dead Stock Identification (Validates: Requirements 4.3)
 *
 * These test pure computation logic (not database queries) using in-memory helper functions.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Pure Computation Helpers (in-memory analytics logic) ──────────────────────

export interface SalesRecord {
  productId: string;
  quantitySold: number;
  salePrice: number;
  saleDate: string; // YYYY-MM-DD
}

export interface SalesSummary {
  totalRevenue: number;
  totalUnits: number;
  uniqueSkus: number;
}

export interface RankedProduct {
  productId: string;
  value: number; // revenue or units depending on sort
}

export interface ProductWithSales {
  productId: string;
  lastSaleDate: string | null; // YYYY-MM-DD or null if never sold
}

/**
 * Calculate sales summary from a list of sales records.
 * total_revenue = sum of (quantity_sold × sale_price)
 * total_units = sum of quantity_sold
 * unique_skus = count of distinct product IDs
 */
export function calculateSalesSummary(records: SalesRecord[]): SalesSummary {
  let totalRevenue = 0;
  let totalUnits = 0;
  const skuSet = new Set<string>();

  for (const record of records) {
    totalRevenue += record.quantitySold * record.salePrice;
    totalUnits += record.quantitySold;
    skuSet.add(record.productId);
  }

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalUnits,
    uniqueSkus: skuSet.size,
  };
}

/**
 * Get top-N products ranked by a value (revenue or units) in descending order.
 * Returns at most `limit` items (default 20).
 */
export function getTopNProducts(
  productValues: RankedProduct[],
  limit: number = 20
): RankedProduct[] {
  const sorted = [...productValues].sort((a, b) => b.value - a.value);
  return sorted.slice(0, limit);
}

/**
 * Identify dead stock: products with zero sales in the last 30 days.
 * Returns products sorted by last sale date ascending (null/oldest first).
 */
export function identifyDeadStock(
  allProducts: ProductWithSales[],
  salesInLast30Days: Set<string>
): ProductWithSales[] {
  const deadStock = allProducts.filter(
    (product) => !salesInLast30Days.has(product.productId)
  );

  return deadStock.sort((a, b) => {
    if (a.lastSaleDate === null && b.lastSaleDate === null) return 0;
    if (a.lastSaleDate === null) return -1;
    if (b.lastSaleDate === null) return 1;
    return a.lastSaleDate.localeCompare(b.lastSaleDate);
  });
}

// ─── Arbitraries ───────────────────────────────────────────────────────────────

/** Generate a product ID */
const productIdArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
  { minLength: 4, maxLength: 8 }
).map((s) => `prod-${s}`);

/** Generate a positive quantity */
const quantityArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 500 });

/** Generate a positive sale price (cents precision) */
const salePriceArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 999999 }).map((v) => v / 100);

/** Generate a date string in YYYY-MM-DD format */
const dateArb: fc.Arbitrary<string> = fc.date({
  min: new Date('2023-01-01'),
  max: new Date('2024-12-31'),
}).map((d) => d.toISOString().split('T')[0]);

/** Generate a single sales record */
const salesRecordArb: fc.Arbitrary<SalesRecord> = fc.record({
  productId: productIdArb,
  quantitySold: quantityArb,
  salePrice: salePriceArb,
  saleDate: dateArb,
});

/** Generate a list of sales records */
const salesRecordsArb: fc.Arbitrary<SalesRecord[]> = fc.array(salesRecordArb, {
  minLength: 0,
  maxLength: 50,
});

/** Generate a ranked product entry */
const rankedProductArb: fc.Arbitrary<RankedProduct> = fc.record({
  productId: productIdArb,
  value: fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true }),
});

/** Generate a list of ranked products with unique IDs */
const rankedProductsArb: fc.Arbitrary<RankedProduct[]> = fc
  .array(rankedProductArb, { minLength: 0, maxLength: 50 })
  .map((products) => {
    // Deduplicate by productId (keep last occurrence)
    const seen = new Map<string, RankedProduct>();
    for (const p of products) {
      seen.set(p.productId, p);
    }
    return Array.from(seen.values());
  });

/** Generate a product with sales info */
const productWithSalesArb: fc.Arbitrary<ProductWithSales> = fc.record({
  productId: productIdArb,
  lastSaleDate: fc.option(dateArb, { nil: null }),
});

// ─── Property 8: Sales Summary Aggregation ─────────────────────────────────────

describe('Property 8: Sales Summary Aggregation', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any set of sales records within a date range:
   * - total_revenue = sum of (quantity_sold × sale_price) for each record
   * - total_units = sum of quantity_sold
   * - unique_skus = count of distinct product IDs
   */

  it('total_revenue equals sum of (quantity_sold × sale_price) for all records', () => {
    fc.assert(
      fc.property(salesRecordsArb, (records) => {
        const summary = calculateSalesSummary(records);

        const expectedRevenue = records.reduce(
          (sum, r) => sum + r.quantitySold * r.salePrice,
          0
        );

        expect(summary.totalRevenue).toBeCloseTo(
          Math.round(expectedRevenue * 100) / 100,
          2
        );
      }),
      { numRuns: 100 }
    );
  });

  it('total_units equals sum of quantity_sold for all records', () => {
    fc.assert(
      fc.property(salesRecordsArb, (records) => {
        const summary = calculateSalesSummary(records);

        const expectedUnits = records.reduce((sum, r) => sum + r.quantitySold, 0);

        expect(summary.totalUnits).toBe(expectedUnits);
      }),
      { numRuns: 100 }
    );
  });

  it('unique_skus equals count of distinct product IDs', () => {
    fc.assert(
      fc.property(salesRecordsArb, (records) => {
        const summary = calculateSalesSummary(records);

        const expectedSkus = new Set(records.map((r) => r.productId)).size;

        expect(summary.uniqueSkus).toBe(expectedSkus);
      }),
      { numRuns: 100 }
    );
  });

  it('empty records produce zero summary', () => {
    const summary = calculateSalesSummary([]);
    expect(summary.totalRevenue).toBe(0);
    expect(summary.totalUnits).toBe(0);
    expect(summary.uniqueSkus).toBe(0);
  });
});

// ─── Property 9: Top-N Product Ranking ─────────────────────────────────────────

describe('Property 9: Top-N Product Ranking', () => {
  /**
   * **Validates: Requirements 4.2**
   *
   * For any set of products with sales data, the top-20 list sorted by
   * revenue (or units) should be:
   * - In descending order
   * - Contain at most 20 items
   * - No excluded product should have a higher value than the lowest-ranked included product
   */

  it('result is sorted in descending order by value', () => {
    fc.assert(
      fc.property(rankedProductsArb, (products) => {
        const topN = getTopNProducts(products, 20);

        for (let i = 1; i < topN.length; i++) {
          expect(topN[i - 1].value).toBeGreaterThanOrEqual(topN[i].value);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('result contains at most 20 items', () => {
    fc.assert(
      fc.property(rankedProductsArb, (products) => {
        const topN = getTopNProducts(products, 20);

        expect(topN.length).toBeLessThanOrEqual(20);
      }),
      { numRuns: 100 }
    );
  });

  it('no excluded product has a higher value than the lowest-ranked included product', () => {
    fc.assert(
      fc.property(rankedProductsArb, (products) => {
        const topN = getTopNProducts(products, 20);

        if (topN.length === 0) return; // Nothing to check

        const includedIds = new Set(topN.map((p) => p.productId));
        const lowestIncluded = topN[topN.length - 1].value;

        // Every excluded product must have value <= lowestIncluded
        for (const product of products) {
          if (!includedIds.has(product.productId)) {
            expect(product.value).toBeLessThanOrEqual(lowestIncluded);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('result contains at most limit items for any custom limit', () => {
    const limitArb = fc.integer({ min: 1, max: 50 });

    fc.assert(
      fc.property(rankedProductsArb, limitArb, (products, limit) => {
        const topN = getTopNProducts(products, limit);

        expect(topN.length).toBeLessThanOrEqual(limit);
        expect(topN.length).toBeLessThanOrEqual(products.length);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 10: Dead Stock Identification ────────────────────────────────────

describe('Property 10: Dead Stock Identification', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any set of products with sales history, the dead stock list should:
   * - Contain exactly those products with zero sales in the last 30 days
   * - Be sorted by last sale date in ascending order (null first)
   */

  it('contains exactly those products with zero sales in last 30 days', () => {
    const productsArb = fc.array(productWithSalesArb, { minLength: 1, maxLength: 30 })
      .map((products) => {
        // Deduplicate by productId
        const seen = new Map<string, ProductWithSales>();
        for (const p of products) {
          seen.set(p.productId, p);
        }
        return Array.from(seen.values());
      });

    // Generate a subset of product IDs that had sales in last 30 days
    fc.assert(
      fc.property(productsArb, (products) => {
        // Randomly assign some products as having recent sales
        const recentSales = new Set<string>();
        for (const p of products) {
          if (Math.random() > 0.5) {
            recentSales.add(p.productId);
          }
        }

        const deadStock = identifyDeadStock(products, recentSales);

        // Every dead stock item should NOT be in recentSales
        for (const item of deadStock) {
          expect(recentSales.has(item.productId)).toBe(false);
        }

        // Every product NOT in recentSales should be in deadStock
        const deadStockIds = new Set(deadStock.map((d) => d.productId));
        for (const product of products) {
          if (!recentSales.has(product.productId)) {
            expect(deadStockIds.has(product.productId)).toBe(true);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('result is sorted by last sale date ascending (null first)', () => {
    const productsArb = fc.array(productWithSalesArb, { minLength: 1, maxLength: 30 })
      .map((products) => {
        const seen = new Map<string, ProductWithSales>();
        for (const p of products) {
          seen.set(p.productId, p);
        }
        return Array.from(seen.values());
      });

    fc.assert(
      fc.property(productsArb, (products) => {
        // All products are dead stock (no recent sales)
        const emptyRecentSales = new Set<string>();
        const deadStock = identifyDeadStock(products, emptyRecentSales);

        for (let i = 1; i < deadStock.length; i++) {
          const prev = deadStock[i - 1].lastSaleDate;
          const curr = deadStock[i].lastSaleDate;

          // null should come first (ascending)
          if (prev === null) {
            // prev is null, that's always <= anything
            continue;
          }
          if (curr === null) {
            // curr is null but prev is not — this would violate ordering
            expect(prev).toBeNull();
          } else {
            // Both are non-null strings: prev <= curr
            expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('dead stock count equals total products minus products with recent sales', () => {
    const productsArb = fc.array(productWithSalesArb, { minLength: 0, maxLength: 30 })
      .map((products) => {
        const seen = new Map<string, ProductWithSales>();
        for (const p of products) {
          seen.set(p.productId, p);
        }
        return Array.from(seen.values());
      });

    fc.assert(
      fc.property(productsArb, fc.integer({ min: 0, max: 15 }), (products, numWithSales) => {
        // Pick first N products as having recent sales
        const recentSales = new Set<string>();
        for (let i = 0; i < Math.min(numWithSales, products.length); i++) {
          recentSales.add(products[i].productId);
        }

        const deadStock = identifyDeadStock(products, recentSales);

        // Count of products without recent sales
        const expectedCount = products.filter(
          (p) => !recentSales.has(p.productId)
        ).length;

        expect(deadStock.length).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });
});
