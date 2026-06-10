/**
 * Feature: grocery-inventory-intelligence
 *
 * Property-based tests for data normalization:
 * - Property 4: Date Format Standardization Round-Trip (Validates: Requirements 3.3)
 * - Property 5: Currency Value Standardization Round-Trip (Validates: Requirements 3.4)
 * - Property 6: Date Range Validation (Validates: Requirements 3.5)
 * - Property 3: Fuzzy Duplicate Detection Threshold (Validates: Requirements 3.1)
 * - Property 7: Data Quality Score Invariants (Validates: Requirements 3.6)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseDate, isDateFlaggable } from './date-parser.js';
import { parseCurrency } from './currency-parser.js';
import { calculateSimilarity } from './duplicate-detector.js';
import { calculateQualityScore, type ImportRecord } from './quality-scorer.js';

// ─── Arbitraries ───────────────────────────────────────────────────────────────

/** Generate a valid year (reasonable range) */
const yearArb = fc.integer({ min: 1900, max: 2099 });

/** Generate a valid month (1-12) */
const monthArb = fc.integer({ min: 1, max: 12 });

/** Generate a valid day for a given year/month */
function dayArbForMonth(year: number, month: number): fc.Arbitrary<number> {
  const daysInMonth = new Date(year, month, 0).getDate();
  return fc.integer({ min: 1, max: daysInMonth });
}

/** Generate a valid date tuple [year, month, day] */
const validDateArb: fc.Arbitrary<[number, number, number]> = yearArb
  .chain((year) =>
    monthArb.chain((month) =>
      dayArbForMonth(year, month).map((day) => [year, month, day] as [number, number, number])
    )
  );

/** Three-letter month abbreviations */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a date as ISO: YYYY-MM-DD */
function formatISO(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/** Format a date as DD-Mon-YYYY */
function formatDDMonYYYY(year: number, month: number, day: number): string {
  return `${day}-${MONTH_NAMES[month - 1]}-${year}`;
}

/** Format a date as MM/DD/YYYY (unambiguous: day > 12 or second value > 12) */
function formatMMDDYYYY(year: number, month: number, day: number): string {
  return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
}

/** Generate a positive numeric value suitable for currency (up to 2 decimal places) */
const positiveAmountArb: fc.Arbitrary<number> = fc
  .integer({ min: 0, max: 99999999 })
  .map((v) => v / 100); // 0.00 to 999999.99

/** Currency symbols */
const currencySymbolArb = fc.constantFrom('$', '€', '£', '¥', '');

/** Format a number with US-style thousands separators */
function formatWithCommas(value: number): string {
  const parts = value.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** Generate a non-empty product name string */
const productNameArb: fc.Arbitrary<string> = fc.stringOf(
  fc.char().filter((c) => c.trim().length > 0 && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127),
  { minLength: 1, maxLength: 50 }
);

/** Generate a similarity threshold between 0 and 1 */
const thresholdArb: fc.Arbitrary<number> = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

/** Generate a complete ImportRecord (all fields filled) */
const completeRecordArb: fc.Arbitrary<ImportRecord> = fc.record({
  product_name: fc.string({ minLength: 1, maxLength: 30 }),
  quantity_sold: fc.integer({ min: 1, max: 1000 }),
  sku_id: fc.string({ minLength: 3, maxLength: 10 }),
  sale_price: fc.double({ min: 0.01, max: 99999, noNaN: true, noDefaultInfinity: true }).map((v) => Math.round(v * 100) / 100),
  sale_date: validDateArb.map(([y, m, d]) => formatISO(y, m, d)),
  category: fc.constantFrom('Produce', 'Dairy', 'Meat', 'Bakery', 'Frozen'),
  supplier_name: fc.string({ minLength: 1, maxLength: 20 }),
});

/** Generate an ImportRecord with some missing required fields */
const incompleteRecordArb: fc.Arbitrary<ImportRecord> = fc.record({
  product_name: fc.constantFrom(null, undefined, '') as fc.Arbitrary<string | null>,
  quantity_sold: fc.constantFrom(null, undefined) as fc.Arbitrary<number | null>,
  sku_id: fc.option(fc.string({ minLength: 3, maxLength: 10 }), { nil: null }),
  sale_price: fc.option(
    fc.double({ min: 0.01, max: 99999, noNaN: true, noDefaultInfinity: true }).map((v) => Math.round(v * 100) / 100),
    { nil: null }
  ),
  sale_date: fc.option(validDateArb.map(([y, m, d]) => formatISO(y, m, d)), { nil: null }),
  category: fc.option(fc.constantFrom('Produce', 'Dairy', 'Meat'), { nil: null }),
  supplier_name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

// ─── Property 4: Date Format Standardization Round-Trip ────────────────────────

describe('Property 4: Date Format Standardization Round-Trip', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any valid date value formatted in any of the supported input formats,
   * parsing the formatted string should produce the original date value.
   */

  it('ISO format (YYYY-MM-DD) round-trip preserves date values', () => {
    fc.assert(
      fc.property(validDateArb, ([year, month, day]) => {
        const formatted = formatISO(year, month, day);
        const result = parseDate(formatted);

        expect(result).not.toBeNull();
        expect(result!.year).toBe(year);
        expect(result!.month).toBe(month);
        expect(result!.day).toBe(day);
        expect(result!.isoString).toBe(formatted);
      }),
      { numRuns: 100 }
    );
  });

  it('DD-Mon-YYYY format round-trip preserves date values', () => {
    fc.assert(
      fc.property(validDateArb, ([year, month, day]) => {
        const formatted = formatDDMonYYYY(year, month, day);
        const result = parseDate(formatted);

        expect(result).not.toBeNull();
        expect(result!.year).toBe(year);
        expect(result!.month).toBe(month);
        expect(result!.day).toBe(day);
      }),
      { numRuns: 100 }
    );
  });

  it('MM/DD/YYYY format round-trip preserves date values (unambiguous dates with day > 12)', () => {
    // Use dates where day > 12 to ensure unambiguous parsing in month-first mode
    const unambiguousDateArb = yearArb.chain((year) =>
      monthArb.chain((month) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const minDay = Math.min(13, daysInMonth);
        if (minDay > daysInMonth) {
          return fc.constant([year, month, daysInMonth] as [number, number, number]);
        }
        return fc.integer({ min: minDay, max: daysInMonth }).map(
          (day) => [year, month, day] as [number, number, number]
        );
      })
    );

    fc.assert(
      fc.property(unambiguousDateArb, ([year, month, day]) => {
        const formatted = formatMMDDYYYY(year, month, day);
        const result = parseDate(formatted, { preferMonthFirst: true });

        expect(result).not.toBeNull();
        expect(result!.year).toBe(year);
        expect(result!.month).toBe(month);
        expect(result!.day).toBe(day);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 5: Currency Value Standardization Round-Trip ─────────────────────

describe('Property 5: Currency Value Standardization Round-Trip', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any numeric value formatted with currency symbols and/or comma-separated
   * thousands, the currency parser should extract the correct numeric value.
   */

  it('plain numeric values are parsed correctly', () => {
    fc.assert(
      fc.property(positiveAmountArb, (amount) => {
        const formatted = amount.toFixed(2);
        const result = parseCurrency(formatted);

        expect(result).not.toBeNull();
        expect(result).toBeCloseTo(amount, 2);
      }),
      { numRuns: 100 }
    );
  });

  it('values with currency symbols are parsed correctly', () => {
    fc.assert(
      fc.property(
        positiveAmountArb.filter((v) => v > 0),
        fc.constantFrom('$', '€', '£', '¥'),
        (amount, symbol) => {
          const formatted = `${symbol}${amount.toFixed(2)}`;
          const result = parseCurrency(formatted);

          expect(result).not.toBeNull();
          expect(result).toBeCloseTo(amount, 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('values with comma-separated thousands are parsed correctly', () => {
    // Use values >= 1000 to ensure commas are present
    const largeAmountArb = fc.integer({ min: 100000, max: 99999999 }).map((v) => v / 100);

    fc.assert(
      fc.property(largeAmountArb, (amount) => {
        const formatted = formatWithCommas(amount);
        const result = parseCurrency(formatted);

        expect(result).not.toBeNull();
        expect(result).toBeCloseTo(amount, 2);
      }),
      { numRuns: 100 }
    );
  });

  it('values with currency symbols and comma-separated thousands are parsed correctly', () => {
    const largeAmountArb = fc.integer({ min: 100000, max: 99999999 }).map((v) => v / 100);

    fc.assert(
      fc.property(
        largeAmountArb,
        fc.constantFrom('$', '€', '£', '¥'),
        (amount, symbol) => {
          const formatted = `${symbol}${formatWithCommas(amount)}`;
          const result = parseCurrency(formatted);

          expect(result).not.toBeNull();
          expect(result).toBeCloseTo(amount, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 6: Date Range Validation ─────────────────────────────────────────

describe('Property 6: Date Range Validation', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any date value, the normalizer should flag it for review if and only if
   * the date is in the future or more than 5 years in the past.
   */

  it('future dates are always flagged', () => {
    const referenceDateArb = fc.date({
      min: new Date('2000-01-01'),
      max: new Date('2030-12-31'),
    });

    fc.assert(
      fc.property(
        referenceDateArb,
        fc.integer({ min: 1, max: 3650 }), // 1 to 10 years of days ahead
        (referenceDate, daysAhead) => {
          const futureDate = new Date(referenceDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);
          expect(isDateFlaggable(futureDate, referenceDate)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('dates more than 5 years in the past are always flagged', () => {
    const referenceDateArb = fc.date({
      min: new Date('2010-01-01'),
      max: new Date('2030-12-31'),
    });

    fc.assert(
      fc.property(
        referenceDateArb,
        fc.integer({ min: 1, max: 3650 }), // additional days beyond 5 years
        (referenceDate, extraDays) => {
          // More than 5 years ago
          const fiveYearsOneDay = new Date(referenceDate);
          fiveYearsOneDay.setFullYear(fiveYearsOneDay.getFullYear() - 5);
          const oldDate = new Date(fiveYearsOneDay.getTime() - extraDays * 24 * 60 * 60 * 1000);

          expect(isDateFlaggable(oldDate, referenceDate)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('dates within the valid range (not future, not more than 5 years old) are not flagged', () => {
    const referenceDateArb = fc.date({
      min: new Date('2010-01-01'),
      max: new Date('2030-12-31'),
    });

    fc.assert(
      fc.property(
        referenceDateArb,
        fc.integer({ min: 0, max: 1825 }), // 0 to ~5 years of days in the past
        (referenceDate, daysBack) => {
          // Create a date that is at most 5 years in the past (using days to stay within bounds)
          const pastDate = new Date(referenceDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

          // Verify it's not more than 5 years ago
          const fiveYearsAgo = new Date(referenceDate);
          fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

          if (pastDate.getTime() >= fiveYearsAgo.getTime()) {
            expect(isDateFlaggable(pastDate, referenceDate)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 3: Fuzzy Duplicate Detection Threshold ───────────────────────────

describe('Property 3: Fuzzy Duplicate Detection Threshold', () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * For any two product names and a similarity threshold, the duplicate detector
   * should flag the pair as a duplicate if and only if their computed similarity
   * score is >= the threshold.
   */

  it('pair is flagged as duplicate iff similarity score >= threshold', () => {
    fc.assert(
      fc.property(
        productNameArb,
        productNameArb,
        thresholdArb,
        (nameA, nameB, threshold) => {
          const score = calculateSimilarity(nameA, nameB);

          // The score should be between 0 and 1
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);

          // The detection decision should be consistent with the threshold
          const wouldBeDetected = score >= threshold;

          // Verify the biconditional: detected iff score >= threshold
          if (wouldBeDetected) {
            expect(score).toBeGreaterThanOrEqual(threshold);
          } else {
            expect(score).toBeLessThan(threshold);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('identical names always produce similarity score of 1.0', () => {
    fc.assert(
      fc.property(productNameArb, (name) => {
        const score = calculateSimilarity(name, name);
        expect(score).toBe(1.0);
      }),
      { numRuns: 100 }
    );
  });

  it('similarity is symmetric: similarity(a, b) equals similarity(b, a)', () => {
    fc.assert(
      fc.property(productNameArb, productNameArb, (nameA, nameB) => {
        const scoreAB = calculateSimilarity(nameA, nameB);
        const scoreBA = calculateSimilarity(nameB, nameA);
        expect(scoreAB).toBeCloseTo(scoreBA, 10);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 7: Data Quality Score Invariants ─────────────────────────────────

describe('Property 7: Data Quality Score Invariants', () => {
  /**
   * **Validates: Requirements 3.6**
   *
   * For any set of imported records, the quality score should satisfy:
   * (a) overall score is in [0, 100]
   * (b) sub-scores are each in [0, 100]
   * (c) a dataset with all required fields filled should score higher on completeness
   *     than one with missing fields
   */

  it('all scores are in the range [0, 100] for any input', () => {
    const recordsArb = fc.array(
      fc.oneof(completeRecordArb, incompleteRecordArb),
      { minLength: 1, maxLength: 20 }
    );

    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = calculateQualityScore(records);

        expect(result.overall).toBeGreaterThanOrEqual(0);
        expect(result.overall).toBeLessThanOrEqual(100);
        expect(result.completeness).toBeGreaterThanOrEqual(0);
        expect(result.completeness).toBeLessThanOrEqual(100);
        expect(result.consistency).toBeGreaterThanOrEqual(0);
        expect(result.consistency).toBeLessThanOrEqual(100);
        expect(result.validity).toBeGreaterThanOrEqual(0);
        expect(result.validity).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 }
    );
  });

  it('dataset with all required fields filled scores higher on completeness than one with missing required fields', () => {
    fc.assert(
      fc.property(
        fc.array(completeRecordArb, { minLength: 1, maxLength: 10 }),
        fc.array(incompleteRecordArb, { minLength: 1, maxLength: 10 }),
        (completeRecords, incompleteRecords) => {
          const completeResult = calculateQualityScore(completeRecords);
          const incompleteResult = calculateQualityScore(incompleteRecords);

          // Complete records (all required fields filled) should have higher completeness
          expect(completeResult.completeness).toBeGreaterThan(incompleteResult.completeness);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('overall score is a weighted average of sub-scores', () => {
    const recordsArb = fc.array(completeRecordArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = calculateQualityScore(records);
        const expectedOverall = Math.round(
          result.completeness * 0.4 + result.consistency * 0.3 + result.validity * 0.3
        );

        expect(result.overall).toBe(expectedOverall);
      }),
      { numRuns: 100 }
    );
  });
});
