/**
 * Unit tests for the data quality scoring module.
 *
 * Validates: Requirements 3.6
 */

import { describe, it, expect } from 'vitest';
import { calculateQualityScore, type ImportRecord } from './quality-scorer.js';

describe('calculateQualityScore', () => {
  describe('empty input', () => {
    it('should return zero scores for empty array', () => {
      const result = calculateQualityScore([]);
      expect(result.overall).toBe(0);
      expect(result.completeness).toBe(0);
      expect(result.consistency).toBe(0);
      expect(result.validity).toBe(0);
      expect(result.details).toEqual([]);
    });
  });

  describe('completeness scoring', () => {
    it('should score 100 completeness when all fields are filled', () => {
      const records: ImportRecord[] = [
        {
          product_name: 'Apples',
          quantity_sold: 10,
          sku_id: 'SKU001',
          sale_price: 2.99,
          sale_date: '2024-01-15',
          category: 'Produce',
          supplier_name: 'FarmFresh',
        },
      ];
      const result = calculateQualityScore(records);
      expect(result.completeness).toBe(100);
    });

    it('should score lower completeness when required fields are missing', () => {
      const records: ImportRecord[] = [
        {
          product_name: null,
          quantity_sold: 10,
          sku_id: 'SKU001',
          sale_price: 2.99,
          sale_date: '2024-01-15',
          category: 'Produce',
          supplier_name: 'FarmFresh',
        },
      ];
      const result = calculateQualityScore(records);
      expect(result.completeness).toBeLessThan(100);
    });

    it('should score higher with only optional fields missing vs required fields missing', () => {
      const missingOptional: ImportRecord[] = [
        {
          product_name: 'Apples',
          quantity_sold: 10,
          sku_id: null,
          sale_price: null,
          sale_date: null,
          category: null,
          supplier_name: null,
        },
      ];
      const missingRequired: ImportRecord[] = [
        {
          product_name: null,
          quantity_sold: null,
          sku_id: 'SKU001',
          sale_price: 2.99,
          sale_date: '2024-01-15',
          category: 'Produce',
          supplier_name: 'FarmFresh',
        },
      ];
      const optionalResult = calculateQualityScore(missingOptional);
      const requiredResult = calculateQualityScore(missingRequired);
      expect(optionalResult.completeness).toBeGreaterThan(requiredResult.completeness);
    });
  });

  describe('consistency scoring', () => {
    it('should score 100 consistency when all dates are in the same format', () => {
      const records: ImportRecord[] = [
        { product_name: 'A', quantity_sold: 1, sale_date: '2024-01-15' },
        { product_name: 'B', quantity_sold: 2, sale_date: '2024-02-20' },
        { product_name: 'C', quantity_sold: 3, sale_date: '2024-03-25' },
      ];
      const result = calculateQualityScore(records);
      expect(result.consistency).toBe(100);
    });

    it('should score lower consistency when dates are mixed formats', () => {
      const records: ImportRecord[] = [
        { product_name: 'A', quantity_sold: 1, sale_date: '2024-01-15' },
        { product_name: 'B', quantity_sold: 2, sale_date: '02/20/2024' },
        { product_name: 'C', quantity_sold: 3, sale_date: '25-Mar-2024' },
      ];
      const result = calculateQualityScore(records);
      expect(result.consistency).toBeLessThan(100);
    });
  });

  describe('validity scoring', () => {
    it('should score 100 validity when all records have valid values', () => {
      const records: ImportRecord[] = [
        { product_name: 'Apples', quantity_sold: 10, sale_price: 2.99, sale_date: '2024-01-15' },
        { product_name: 'Bananas', quantity_sold: 5, sale_price: 1.49, sale_date: '2024-01-16' },
      ];
      const result = calculateQualityScore(records);
      expect(result.validity).toBe(100);
    });

    it('should reduce validity for negative quantities', () => {
      const records: ImportRecord[] = [
        { product_name: 'Apples', quantity_sold: -5, sale_price: 2.99, sale_date: '2024-01-15' },
        { product_name: 'Bananas', quantity_sold: 5, sale_price: 1.49, sale_date: '2024-01-16' },
      ];
      const result = calculateQualityScore(records);
      expect(result.validity).toBeLessThan(100);
    });

    it('should reduce validity for negative prices', () => {
      const records: ImportRecord[] = [
        { product_name: 'Apples', quantity_sold: 10, sale_price: -2.99, sale_date: '2024-01-15' },
        { product_name: 'Bananas', quantity_sold: 5, sale_price: 1.49, sale_date: '2024-01-16' },
      ];
      const result = calculateQualityScore(records);
      expect(result.validity).toBeLessThan(100);
    });

    it('should reduce validity for unreasonably high prices', () => {
      const records: ImportRecord[] = [
        { product_name: 'Apples', quantity_sold: 10, sale_price: 200000, sale_date: '2024-01-15' },
      ];
      const result = calculateQualityScore(records);
      expect(result.validity).toBeLessThan(100);
    });
  });

  describe('overall scoring', () => {
    it('should produce overall as weighted average of sub-scores', () => {
      const records: ImportRecord[] = [
        {
          product_name: 'Apples',
          quantity_sold: 10,
          sku_id: 'SKU001',
          sale_price: 2.99,
          sale_date: '2024-01-15',
          category: 'Produce',
          supplier_name: 'FarmFresh',
        },
      ];
      const result = calculateQualityScore(records);
      const expectedOverall = Math.round(
        result.completeness * 0.4 + result.consistency * 0.3 + result.validity * 0.3
      );
      expect(result.overall).toBe(expectedOverall);
    });

    it('should keep all scores in [0, 100] range', () => {
      const records: ImportRecord[] = [
        { product_name: null, quantity_sold: null },
        { product_name: '', quantity_sold: -1, sale_price: -5, sale_date: 'invalid' },
      ];
      const result = calculateQualityScore(records);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
      expect(result.completeness).toBeGreaterThanOrEqual(0);
      expect(result.completeness).toBeLessThanOrEqual(100);
      expect(result.consistency).toBeGreaterThanOrEqual(0);
      expect(result.consistency).toBeLessThanOrEqual(100);
      expect(result.validity).toBeGreaterThanOrEqual(0);
      expect(result.validity).toBeLessThanOrEqual(100);
    });
  });

  describe('quality details', () => {
    it('should report missing required fields in details', () => {
      const records: ImportRecord[] = [
        { product_name: null, quantity_sold: 10 },
        { product_name: 'Apples', quantity_sold: null },
      ];
      const result = calculateQualityScore(records);
      const requiredDetails = result.details.filter((d) => d.severity === 'high');
      expect(requiredDetails.length).toBeGreaterThan(0);
    });

    it('should report invalid quantities in details', () => {
      const records: ImportRecord[] = [
        { product_name: 'Apples', quantity_sold: -5 },
      ];
      const result = calculateQualityScore(records);
      const quantityDetails = result.details.filter((d) => d.field === 'quantity_sold');
      expect(quantityDetails.length).toBeGreaterThan(0);
    });
  });
});
