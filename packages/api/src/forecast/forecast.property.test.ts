/**
 * Feature: grocery-inventory-intelligence
 *
 * Property-based tests for Demand Forecasting Engine:
 * - Property 16: Forecast Data Sufficiency Handling (Validates: Requirements 7.1, 7.5)
 * - Property 17: Forecast Confidence Interval Ordering (Validates: Requirements 7.4)
 * - Property 18: Forecast Accuracy (MAPE) Calculation (Validates: Requirements 7.6)
 *
 * These test pure computation logic using in-memory helper functions.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateForecast,
  calculateMAPE,
} from './engine.js';
import type { HistoryPoint, Horizon } from './engine.js';

// ─── Arbitraries ───────────────────────────────────────────────────────────────

/** Generate a horizon value (7 or 14) */
const horizonArb: fc.Arbitrary<Horizon> = fc.constantFrom(7 as Horizon, 14 as Horizon);

/** Generate a history point */
const historyPointArb = (startDate: Date, dayOffset: number): fc.Arbitrary<HistoryPoint> =>
  fc.integer({ min: 0, max: 200 }).map((quantity) => ({
    date: new Date(startDate.getTime() + dayOffset * 24 * 60 * 60 * 1000),
    quantity,
  }));

/** Generate a history with specific number of days (consecutive days) */
function historyArb(minDays: number, maxDays: number): fc.Arbitrary<HistoryPoint[]> {
  return fc
    .integer({ min: minDays, max: maxDays })
    .chain((numDays) => {
      const startDate = new Date('2024-01-01');
      const arbs = [];
      for (let i = 0; i < numDays; i++) {
        arbs.push(historyPointArb(startDate, i));
      }
      return arbs.length > 0 ? fc.tuple(...(arbs as [fc.Arbitrary<HistoryPoint>, ...fc.Arbitrary<HistoryPoint>[]])).map((arr) => arr as HistoryPoint[]) : fc.constant([] as HistoryPoint[]);
    });
}

/** Generate non-zero actual values for MAPE testing */
const nonZeroActualsArb: fc.Arbitrary<number[]> = fc.array(
  fc.double({ min: 0.01, max: 1000, noNaN: true, noDefaultInfinity: true }),
  { minLength: 1, maxLength: 30 }
);

/** Generate forecast values for MAPE testing */
const forecastValuesArb = (length: number): fc.Arbitrary<number[]> =>
  fc.array(
    fc.double({ min: 0, max: 1500, noNaN: true, noDefaultInfinity: true }),
    { minLength: length, maxLength: length }
  );

/** Category average daily sales */
const categoryAvgArb: fc.Arbitrary<number> = fc.double({
  min: 0,
  max: 50,
  noNaN: true,
  noDefaultInfinity: true,
});

// ─── Property 16: Forecast Data Sufficiency Handling ───────────────────────────

describe('Property 16: Forecast Data Sufficiency Handling', () => {
  /**
   * **Validates: Requirements 7.1, 7.5**
   *
   * For any SKU, the forecast engine should:
   * (a) generate forecasts with exactly 7 or 14 daily predictions only when the SKU
   *     has >= 30 days of history marked as "full" quality
   * (b) produce a "limited data estimate" labeled forecast using category averages
   *     when history is < 30 days
   */

  it('(a) generates "full" quality with correct prediction count for >= 30 days history', () => {
    fc.assert(
      fc.property(historyArb(30, 90), horizonArb, (history, horizon) => {
        const result = generateForecast(history, horizon);
        expect(result.dataQuality).toBe('full');
        expect(result.method).toBe('trend_decomposition');
        expect(result.predictions).toHaveLength(horizon);
        expect(result.horizon).toBe(horizon);
      }),
      { numRuns: 100 }
    );
  });

  it('(b) generates "limited" quality for < 30 days history', () => {
    fc.assert(
      fc.property(historyArb(0, 29), horizonArb, categoryAvgArb, (history, horizon, categoryAvg) => {
        const result = generateForecast(history, horizon, categoryAvg);
        expect(result.dataQuality).toBe('limited');
        expect(result.method).toBe('category_average');
        expect(result.predictions).toHaveLength(horizon);
        expect(result.horizon).toBe(horizon);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 17: Forecast Confidence Interval Ordering ────────────────────────

describe('Property 17: Forecast Confidence Interval Ordering', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any generated forecast, each daily prediction should satisfy:
   * low <= expected <= high
   */

  it('low <= expected <= high for full forecasts', () => {
    fc.assert(
      fc.property(historyArb(30, 90), horizonArb, (history, horizon) => {
        const result = generateForecast(history, horizon);
        for (const pred of result.predictions) {
          expect(pred.low).toBeLessThanOrEqual(pred.expected);
          expect(pred.expected).toBeLessThanOrEqual(pred.high);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('low <= expected <= high for limited forecasts', () => {
    fc.assert(
      fc.property(historyArb(0, 29), horizonArb, categoryAvgArb, (history, horizon, categoryAvg) => {
        const result = generateForecast(history, horizon, categoryAvg);
        for (const pred of result.predictions) {
          expect(pred.low).toBeLessThanOrEqual(pred.expected);
          expect(pred.expected).toBeLessThanOrEqual(pred.high);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 18: Forecast Accuracy (MAPE) Calculation ────────────────────────

describe('Property 18: Forecast Accuracy (MAPE) Calculation', () => {
  /**
   * **Validates: Requirements 7.6**
   *
   * For any set of forecast/actual value pairs where all actuals are non-zero,
   * the calculated MAPE should equal mean(|actual - forecast| / |actual|) × 100.
   */

  it('MAPE equals mean(|actual - forecast| / |actual|) × 100', () => {
    fc.assert(
      fc.property(nonZeroActualsArb, (actuals) => {
        return fc.assert(
          fc.property(forecastValuesArb(actuals.length), (forecasts) => {
            const mape = calculateMAPE(actuals, forecasts);
            expect(mape).not.toBeNull();

            // Manual calculation
            const sumAbsPercentError = actuals.reduce((sum, actual, i) => {
              return sum + Math.abs(actual - forecasts[i]) / Math.abs(actual);
            }, 0);
            const expectedMape = (sumAbsPercentError / actuals.length) * 100;

            expect(mape).toBeCloseTo(expectedMape, 8);
          }),
          { numRuns: 1 }
        );
      }),
      { numRuns: 100 }
    );
  });

  it('MAPE is always non-negative', () => {
    fc.assert(
      fc.property(nonZeroActualsArb, (actuals) => {
        return fc.assert(
          fc.property(forecastValuesArb(actuals.length), (forecasts) => {
            const mape = calculateMAPE(actuals, forecasts);
            if (mape !== null) {
              expect(mape).toBeGreaterThanOrEqual(0);
            }
          }),
          { numRuns: 1 }
        );
      }),
      { numRuns: 100 }
    );
  });

  it('MAPE is 0 when forecasts exactly match actuals', () => {
    fc.assert(
      fc.property(nonZeroActualsArb, (actuals) => {
        const mape = calculateMAPE(actuals, [...actuals]);
        expect(mape).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});
