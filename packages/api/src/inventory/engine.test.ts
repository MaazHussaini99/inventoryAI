/**
 * Unit tests for inventory calculation engine.
 *
 * Tests classifyStatus function for correct inventory status classification.
 * Validates: Requirements 5.1, 5.2, 5.5
 */

import { describe, it, expect } from 'vitest';
import { classifyStatus } from './engine.js';

describe('classifyStatus', () => {
  it('returns "in_stock" when estimated stock is above reorder point', () => {
    expect(classifyStatus(50, 10)).toBe('in_stock');
    expect(classifyStatus(11, 10)).toBe('in_stock');
    expect(classifyStatus(100, 50)).toBe('in_stock');
  });

  it('returns "low_stock" when estimated stock equals reorder point', () => {
    expect(classifyStatus(10, 10)).toBe('low_stock');
    expect(classifyStatus(5, 5)).toBe('low_stock');
    expect(classifyStatus(1, 1)).toBe('low_stock');
  });

  it('returns "low_stock" when estimated stock is between 0 and reorder point', () => {
    expect(classifyStatus(5, 10)).toBe('low_stock');
    expect(classifyStatus(1, 10)).toBe('low_stock');
    expect(classifyStatus(3, 5)).toBe('low_stock');
  });

  it('returns "out_of_stock" when estimated stock is zero', () => {
    expect(classifyStatus(0, 10)).toBe('out_of_stock');
    expect(classifyStatus(0, 0)).toBe('out_of_stock');
  });

  it('returns "out_of_stock" when estimated stock is negative (data discrepancy)', () => {
    expect(classifyStatus(-5, 10)).toBe('out_of_stock');
    expect(classifyStatus(-1, 5)).toBe('out_of_stock');
    expect(classifyStatus(-100, 0)).toBe('out_of_stock');
  });

  it('handles edge case where reorder point is 0', () => {
    // stock > 0 and reorder_point = 0 → in_stock (stock > reorder_point)
    expect(classifyStatus(1, 0)).toBe('in_stock');
    expect(classifyStatus(100, 0)).toBe('in_stock');
    // stock = 0 and reorder_point = 0 → out_of_stock (stock <= 0)
    expect(classifyStatus(0, 0)).toBe('out_of_stock');
  });

  it('handles large numbers correctly', () => {
    expect(classifyStatus(10000, 100)).toBe('in_stock');
    expect(classifyStatus(100, 100)).toBe('low_stock');
    expect(classifyStatus(99, 100)).toBe('low_stock');
  });
});
