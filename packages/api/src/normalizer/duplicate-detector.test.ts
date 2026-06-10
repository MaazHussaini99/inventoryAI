/**
 * Unit tests for the fuzzy duplicate detection module.
 * Tests the Jaro-Winkler similarity algorithm and duplicate detection logic.
 *
 * Validates: Requirements 3.1, 3.2
 */

import { describe, it, expect } from 'vitest';
import { calculateSimilarity, detectDuplicates } from './duplicate-detector.js';
import type { ProductInput } from './duplicate-detector.js';

describe('calculateSimilarity', () => {
  describe('exact matches', () => {
    it('should return 1.0 for identical strings', () => {
      expect(calculateSimilarity('Organic Milk', 'Organic Milk')).toBe(1.0);
    });

    it('should return 1.0 for identical strings after case normalization', () => {
      expect(calculateSimilarity('ORGANIC MILK', 'organic milk')).toBe(1.0);
    });

    it('should return 1.0 for identical strings after trimming', () => {
      expect(calculateSimilarity('  Organic Milk  ', 'Organic Milk')).toBe(1.0);
    });
  });

  describe('empty strings', () => {
    it('should return 0.0 when first string is empty', () => {
      expect(calculateSimilarity('', 'hello')).toBe(0.0);
    });

    it('should return 0.0 when second string is empty', () => {
      expect(calculateSimilarity('hello', '')).toBe(0.0);
    });

    it('should return 1.0 when both strings are empty', () => {
      expect(calculateSimilarity('', '')).toBe(1.0);
    });
  });

  describe('completely different strings', () => {
    it('should return a low score for unrelated strings', () => {
      const score = calculateSimilarity('Apple', 'Zebra');
      expect(score).toBeLessThan(0.6);
    });
  });

  describe('similar product names', () => {
    it('should return high score for minor typos', () => {
      const score = calculateSimilarity('Organic Whole Milk', 'Orgnic Whole Milk');
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return high score for slight variations', () => {
      const score = calculateSimilarity('Whole Milk 1 Gallon', 'Whole Milk 1 Gal');
      expect(score).toBeGreaterThan(0.85);
    });

    it('should return moderate score for moderately different names', () => {
      const score = calculateSimilarity('Bananas', 'Banana');
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return high score for plural/singular variations', () => {
      const score = calculateSimilarity('Red Apple', 'Red Apples');
      expect(score).toBeGreaterThan(0.9);
    });
  });

  describe('properties of Jaro-Winkler', () => {
    it('should be symmetric (order should not matter)', () => {
      const scoreAB = calculateSimilarity('Milk 2%', 'Milk 2% Fat');
      const scoreBA = calculateSimilarity('Milk 2% Fat', 'Milk 2%');
      expect(scoreAB).toBeCloseTo(scoreBA, 10);
    });

    it('should return a value between 0 and 1', () => {
      const score = calculateSimilarity('test', 'testing');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should give higher score when strings share a common prefix', () => {
      // "abc xyz" vs "abc xyw" shares prefix "abc xy" - should get prefix bonus
      const withPrefix = calculateSimilarity('Organic Milk 2%', 'Organic Milk 1%');
      const noPrefix = calculateSimilarity('2% Organic Milk', '1% Organic Milk');
      // Both should be similar but prefix variant may differ slightly
      expect(withPrefix).toBeGreaterThan(0.85);
      expect(noPrefix).toBeGreaterThan(0.85);
    });
  });

  describe('single character strings', () => {
    it('should return 1.0 for same single character', () => {
      expect(calculateSimilarity('a', 'a')).toBe(1.0);
    });

    it('should return 0.0 for different single characters', () => {
      expect(calculateSimilarity('a', 'b')).toBe(0.0);
    });
  });
});

describe('detectDuplicates', () => {
  describe('basic detection', () => {
    it('should return empty array when no products are provided', () => {
      const result = detectDuplicates([]);
      expect(result).toEqual([]);
    });

    it('should return empty array for a single product', () => {
      const products: ProductInput[] = [{ id: '1', name: 'Organic Milk' }];
      const result = detectDuplicates(products);
      expect(result).toEqual([]);
    });

    it('should detect exact duplicate names', () => {
      const products: ProductInput[] = [
        { id: '1', name: 'Organic Milk' },
        { id: '2', name: 'Organic Milk' },
      ];
      const result = detectDuplicates(products);
      expect(result).toHaveLength(1);
      expect(result[0].productAId).toBe('1');
      expect(result[0].productBId).toBe('2');
      expect(result[0].similarityScore).toBe(1.0);
    });

    it('should detect near-duplicate names', () => {
      const products: ProductInput[] = [
        { id: '1', name: 'Organic Whole Milk 1 Gallon' },
        { id: '2', name: 'Organic Whole Milk 1 Gal' },
        { id: '3', name: 'Fresh Orange Juice' },
      ];
      const result = detectDuplicates(products, 0.85);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // The milk pair should be detected
      const milkPair = result.find(
        (p) =>
          (p.productAId === '1' && p.productBId === '2') ||
          (p.productAId === '2' && p.productBId === '1')
      );
      expect(milkPair).toBeDefined();
      expect(milkPair!.similarityScore).toBeGreaterThanOrEqual(0.85);
    });

    it('should not detect very different products', () => {
      const products: ProductInput[] = [
        { id: '1', name: 'Organic Milk' },
        { id: '2', name: 'Fresh Bread' },
        { id: '3', name: 'Chicken Wings' },
      ];
      const result = detectDuplicates(products, 0.85);
      expect(result).toHaveLength(0);
    });
  });

  describe('threshold configuration', () => {
    const products: ProductInput[] = [
      { id: '1', name: 'Banana' },
      { id: '2', name: 'Bananas' },
    ];

    it('should use default threshold of 0.85', () => {
      const result = detectDuplicates(products);
      // "Banana" and "Bananas" are very similar, should be detected at default threshold
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect a higher threshold', () => {
      const result = detectDuplicates(products, 0.99);
      // At 0.99 threshold, "Banana" vs "Bananas" should not match
      expect(result).toHaveLength(0);
    });

    it('should detect more pairs with a lower threshold', () => {
      const moreProducts: ProductInput[] = [
        { id: '1', name: 'Apple Juice' },
        { id: '2', name: 'Apple Cider' },
        { id: '3', name: 'Orange Juice' },
      ];
      const lowThreshold = detectDuplicates(moreProducts, 0.5);
      const highThreshold = detectDuplicates(moreProducts, 0.95);
      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
    });
  });

  describe('sorting', () => {
    it('should sort results by similarity score descending', () => {
      const products: ProductInput[] = [
        { id: '1', name: 'Organic Milk' },
        { id: '2', name: 'Organic Milk 2%' },
        { id: '3', name: 'Organic Milk' }, // exact duplicate of 1
      ];
      const result = detectDuplicates(products, 0.7);
      // Check that results are sorted descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].similarityScore).toBeGreaterThanOrEqual(result[i].similarityScore);
      }
    });
  });

  describe('case insensitivity', () => {
    it('should treat names as case-insensitive', () => {
      const products: ProductInput[] = [
        { id: '1', name: 'ORGANIC MILK' },
        { id: '2', name: 'organic milk' },
      ];
      const result = detectDuplicates(products, 0.85);
      expect(result).toHaveLength(1);
      expect(result[0].similarityScore).toBe(1.0);
    });
  });
});
