/**
 * Unit tests for the currency parser module.
 * Tests parsing of various currency formats and edge cases.
 *
 * Validates: Requirements 3.4
 */

import { describe, it, expect } from 'vitest';
import { parseCurrency } from './currency-parser.js';

describe('parseCurrency', () => {
  describe('basic numeric values', () => {
    it('should parse a plain integer', () => {
      expect(parseCurrency('100')).toBe(100);
    });

    it('should parse a decimal number', () => {
      expect(parseCurrency('19.99')).toBe(19.99);
    });

    it('should parse zero', () => {
      expect(parseCurrency('0')).toBe(0);
    });

    it('should parse a large number', () => {
      expect(parseCurrency('1000000')).toBe(1000000);
    });
  });

  describe('currency symbol stripping', () => {
    it('should strip dollar sign', () => {
      expect(parseCurrency('$19.99')).toBe(19.99);
    });

    it('should strip euro sign', () => {
      expect(parseCurrency('€25.50')).toBe(25.50);
    });

    it('should strip pound sign', () => {
      expect(parseCurrency('£100.00')).toBe(100.00);
    });

    it('should strip yen sign', () => {
      expect(parseCurrency('¥5000')).toBe(5000);
    });
  });

  describe('US format (comma thousands, dot decimal)', () => {
    it('should handle comma-separated thousands', () => {
      expect(parseCurrency('1,234.56')).toBe(1234.56);
    });

    it('should handle multiple comma separators', () => {
      expect(parseCurrency('1,234,567.89')).toBe(1234567.89);
    });

    it('should handle thousands with currency symbol', () => {
      expect(parseCurrency('$1,234.56')).toBe(1234.56);
    });

    it('should handle round thousands', () => {
      expect(parseCurrency('1,000')).toBe(1000);
    });
  });

  describe('European format (dot thousands, comma decimal)', () => {
    it('should handle European format with dot thousands', () => {
      expect(parseCurrency('1.234,56')).toBe(1234.56);
    });

    it('should handle European format with multiple dot separators', () => {
      expect(parseCurrency('1.234.567,89')).toBe(1234567.89);
    });

    it('should handle European format with currency symbol', () => {
      expect(parseCurrency('€1.234,56')).toBe(1234.56);
    });
  });

  describe('negative values', () => {
    it('should handle leading minus sign', () => {
      expect(parseCurrency('-5.00')).toBe(-5.00);
    });

    it('should handle minus before currency symbol', () => {
      expect(parseCurrency('-$5.00')).toBe(-5.00);
    });

    it('should handle minus after currency symbol', () => {
      expect(parseCurrency('$-5.00')).toBe(-5.00);
    });

    it('should handle parenthetical negatives', () => {
      expect(parseCurrency('($5.00)')).toBe(-5.00);
    });

    it('should handle parenthetical negatives without symbol', () => {
      expect(parseCurrency('(100.50)')).toBe(-100.50);
    });

    it('should handle negative with thousands', () => {
      expect(parseCurrency('-$1,234.56')).toBe(-1234.56);
    });
  });

  describe('whitespace handling', () => {
    it('should trim leading whitespace', () => {
      expect(parseCurrency('  $10.00')).toBe(10.00);
    });

    it('should trim trailing whitespace', () => {
      expect(parseCurrency('$10.00  ')).toBe(10.00);
    });

    it('should trim surrounding whitespace', () => {
      expect(parseCurrency('  $10.00  ')).toBe(10.00);
    });
  });

  describe('unparseable values', () => {
    it('should return null for empty string', () => {
      expect(parseCurrency('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(parseCurrency('   ')).toBeNull();
    });

    it('should return null for null-like input', () => {
      expect(parseCurrency(null as unknown as string)).toBeNull();
      expect(parseCurrency(undefined as unknown as string)).toBeNull();
    });

    it('should return null for non-numeric text', () => {
      expect(parseCurrency('hello')).toBeNull();
      expect(parseCurrency('N/A')).toBeNull();
      expect(parseCurrency('free')).toBeNull();
    });

    it('should return null for currency symbol alone', () => {
      expect(parseCurrency('$')).toBeNull();
    });

    it('should return null for multiple decimal points', () => {
      expect(parseCurrency('1.2.3')).toBeNull();
    });
  });
});
