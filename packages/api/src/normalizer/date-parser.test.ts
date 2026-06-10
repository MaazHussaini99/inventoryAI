/**
 * Unit tests for the date parser module.
 * Tests parsing of various date formats and date flagging logic.
 *
 * Validates: Requirements 3.3, 3.5
 */

import { describe, it, expect } from 'vitest';
import { parseDate, isDateFlaggable } from './date-parser.js';

describe('parseDate', () => {
  describe('YYYY-MM-DD (ISO 8601)', () => {
    it('should parse a standard ISO date', () => {
      const result = parseDate('2024-01-15');
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 15,
        isoString: '2024-01-15',
      });
    });

    it('should parse ISO date at year boundary', () => {
      const result = parseDate('2023-12-31');
      expect(result).toEqual({
        year: 2023,
        month: 12,
        day: 31,
        isoString: '2023-12-31',
      });
    });

    it('should parse ISO date for Feb 29 in a leap year', () => {
      const result = parseDate('2024-02-29');
      expect(result).toEqual({
        year: 2024,
        month: 2,
        day: 29,
        isoString: '2024-02-29',
      });
    });

    it('should return null for Feb 29 in a non-leap year', () => {
      expect(parseDate('2023-02-29')).toBeNull();
    });

    it('should return null for invalid month', () => {
      expect(parseDate('2024-13-01')).toBeNull();
    });

    it('should return null for invalid day', () => {
      expect(parseDate('2024-01-32')).toBeNull();
    });
  });

  describe('MM/DD/YYYY (US format, preferMonthFirst = true)', () => {
    it('should parse a US-format date', () => {
      const result = parseDate('01/15/2024', { preferMonthFirst: true });
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 15,
        isoString: '2024-01-15',
      });
    });

    it('should parse when day > 12 (unambiguous)', () => {
      const result = parseDate('03/25/2024');
      expect(result).toEqual({
        year: 2024,
        month: 3,
        day: 25,
        isoString: '2024-03-25',
      });
    });

    it('should treat ambiguous date as month-first by default', () => {
      // 01/02/2024 → January 2 (month-first)
      const result = parseDate('01/02/2024');
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 2,
        isoString: '2024-01-02',
      });
    });
  });

  describe('DD/MM/YYYY (European format, preferMonthFirst = false)', () => {
    it('should parse a European-format date', () => {
      const result = parseDate('15/01/2024', { preferMonthFirst: false });
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 15,
        isoString: '2024-01-15',
      });
    });

    it('should treat ambiguous date as day-first when option set', () => {
      // 01/02/2024 → February 1 (day-first)
      const result = parseDate('01/02/2024', { preferMonthFirst: false });
      expect(result).toEqual({
        year: 2024,
        month: 2,
        day: 1,
        isoString: '2024-02-01',
      });
    });

    it('should detect day > 12 and infer DD/MM/YYYY regardless of option', () => {
      // 25/03/2024 — first value > 12, must be day
      const result = parseDate('25/03/2024', { preferMonthFirst: true });
      expect(result).toEqual({
        year: 2024,
        month: 3,
        day: 25,
        isoString: '2024-03-25',
      });
    });
  });

  describe('DD-Mon-YYYY format', () => {
    it('should parse a standard DD-Mon-YYYY date', () => {
      const result = parseDate('15-Jan-2024');
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 15,
        isoString: '2024-01-15',
      });
    });

    it('should be case-insensitive for month abbreviation', () => {
      const result = parseDate('05-FEB-2023');
      expect(result).toEqual({
        year: 2023,
        month: 2,
        day: 5,
        isoString: '2023-02-05',
      });
    });

    it('should parse all month abbreviations', () => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      months.forEach((mon, idx) => {
        const result = parseDate(`01-${mon}-2024`);
        expect(result).not.toBeNull();
        expect(result!.month).toBe(idx + 1);
      });
    });

    it('should return null for invalid month abbreviation', () => {
      expect(parseDate('15-Xyz-2024')).toBeNull();
    });

    it('should handle single-digit day', () => {
      const result = parseDate('3-Mar-2024');
      expect(result).toEqual({
        year: 2024,
        month: 3,
        day: 3,
        isoString: '2024-03-03',
      });
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseDate('')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(parseDate('   ')).toBeNull();
    });

    it('should return null for null-like input', () => {
      expect(parseDate(null as unknown as string)).toBeNull();
      expect(parseDate(undefined as unknown as string)).toBeNull();
    });

    it('should return null for random text', () => {
      expect(parseDate('hello world')).toBeNull();
      expect(parseDate('not-a-date')).toBeNull();
    });

    it('should trim surrounding whitespace', () => {
      const result = parseDate('  2024-01-15  ');
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 15,
        isoString: '2024-01-15',
      });
    });

    it('should return null for date with month 0', () => {
      expect(parseDate('2024-00-15')).toBeNull();
    });

    it('should return null for date with day 0', () => {
      expect(parseDate('2024-01-00')).toBeNull();
    });
  });
});

describe('isDateFlaggable', () => {
  const referenceDate = new Date('2024-06-15T00:00:00.000Z');

  describe('future dates', () => {
    it('should flag a date one day in the future', () => {
      const futureDate = new Date('2024-06-16T00:00:00.000Z');
      expect(isDateFlaggable(futureDate, referenceDate)).toBe(true);
    });

    it('should flag a date one year in the future', () => {
      const futureDate = new Date('2025-06-15T00:00:00.000Z');
      expect(isDateFlaggable(futureDate, referenceDate)).toBe(true);
    });
  });

  describe('dates more than 5 years in the past', () => {
    it('should flag a date more than 5 years ago', () => {
      const oldDate = new Date('2019-06-14T00:00:00.000Z');
      expect(isDateFlaggable(oldDate, referenceDate)).toBe(true);
    });

    it('should flag a date exactly 5 years and one day ago', () => {
      const oldDate = new Date('2019-06-14T00:00:00.000Z');
      expect(isDateFlaggable(oldDate, referenceDate)).toBe(true);
    });

    it('should flag a very old date', () => {
      const oldDate = new Date('2010-01-01T00:00:00.000Z');
      expect(isDateFlaggable(oldDate, referenceDate)).toBe(true);
    });
  });

  describe('valid dates within range', () => {
    it('should not flag the reference date itself', () => {
      expect(isDateFlaggable(referenceDate, referenceDate)).toBe(false);
    });

    it('should not flag a date one day in the past', () => {
      const yesterday = new Date('2024-06-14T00:00:00.000Z');
      expect(isDateFlaggable(yesterday, referenceDate)).toBe(false);
    });

    it('should not flag a date 4 years in the past', () => {
      const fourYearsAgo = new Date('2020-06-15T00:00:00.000Z');
      expect(isDateFlaggable(fourYearsAgo, referenceDate)).toBe(false);
    });

    it('should not flag a date exactly 5 years ago', () => {
      // Exactly 5 years ago is not MORE than 5 years
      const exactlyFiveYears = new Date('2019-06-15T00:00:00.000Z');
      expect(isDateFlaggable(exactlyFiveYears, referenceDate)).toBe(false);
    });
  });

  describe('defaults to current date if no reference', () => {
    it('should use current date as reference when not specified', () => {
      // A date far in the future should always be flaggable
      const farFuture = new Date('2099-01-01T00:00:00.000Z');
      expect(isDateFlaggable(farFuture)).toBe(true);
    });
  });
});
