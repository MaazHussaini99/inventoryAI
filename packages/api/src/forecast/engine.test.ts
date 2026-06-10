/**
 * Unit tests for Forecast Engine
 *
 * Tests specific examples and edge cases for:
 * - trendDecomposition
 * - generateForecast (full and limited)
 * - calculateMAPE
 */

import { describe, it, expect } from 'vitest';
import {
  trendDecomposition,
  generateForecast,
  generateForecastFull,
  generateForecastLimited,
  calculateMAPE,
  standardDeviation,
} from './engine.js';
import type { HistoryPoint } from './engine.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createHistory(days: number, baseQty: number = 10): HistoryPoint[] {
  const history: HistoryPoint[] = [];
  const startDate = new Date('2024-01-01');
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    // Add some variation based on day of week
    const dayFactor = date.getDay() === 0 || date.getDay() === 6 ? 1.3 : 1.0;
    history.push({
      date,
      quantity: Math.round(baseQty * dayFactor + (i % 3)),
    });
  }
  return history;
}

// ─── trendDecomposition ────────────────────────────────────────────────────────

describe('trendDecomposition', () => {
  it('returns empty arrays for empty history', () => {
    const result = trendDecomposition([]);
    expect(result.trend).toHaveLength(0);
    expect(result.seasonal).toHaveLength(7);
    expect(result.residual).toHaveLength(0);
  });

  it('decomposes a constant series into zero seasonal and zero residual', () => {
    const history: HistoryPoint[] = [];
    const start = new Date('2024-01-01'); // Monday
    for (let i = 0; i < 14; i++) {
      history.push({
        date: new Date(start.getTime() + i * 24 * 60 * 60 * 1000),
        quantity: 10,
      });
    }
    const result = trendDecomposition(history);
    expect(result.trend).toHaveLength(14);
    // All trend values should be 10
    for (const t of result.trend) {
      expect(t).toBeCloseTo(10, 1);
    }
    // Residuals should be near zero
    for (const r of result.residual) {
      expect(Math.abs(r)).toBeLessThan(1);
    }
  });

  it('produces seasonal array of length 7', () => {
    const history = createHistory(35);
    const result = trendDecomposition(history);
    expect(result.seasonal).toHaveLength(7);
  });

  it('captures weekend pattern in seasonal component', () => {
    // Create data where weekends (Sat=6, Sun=0) have higher sales
    const history: HistoryPoint[] = [];
    const start = new Date('2024-01-01'); // Monday
    for (let i = 0; i < 28; i++) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      history.push({ date, quantity: isWeekend ? 20 : 10 });
    }
    const result = trendDecomposition(history);
    // Seasonal component for weekend days should be higher
    const sundaySeasonal = result.seasonal[0];
    const saturdaySeasonal = result.seasonal[6];
    const mondaySeasonal = result.seasonal[1];
    expect(sundaySeasonal).toBeGreaterThan(mondaySeasonal);
    expect(saturdaySeasonal).toBeGreaterThan(mondaySeasonal);
  });
});

// ─── standardDeviation ─────────────────────────────────────────────────────────

describe('standardDeviation', () => {
  it('returns 0 for single value', () => {
    expect(standardDeviation([5])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(standardDeviation([])).toBe(0);
  });

  it('calculates correctly for known values', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] => mean=5, std ≈ 2.0
    const result = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result).toBeCloseTo(2.0, 0);
  });
});

// ─── generateForecast ──────────────────────────────────────────────────────────

describe('generateForecast', () => {
  it('returns full quality for >= 30 days of history', () => {
    const history = createHistory(30);
    const result = generateForecast(history, 7);
    expect(result.dataQuality).toBe('full');
    expect(result.method).toBe('trend_decomposition');
    expect(result.predictions).toHaveLength(7);
  });

  it('returns limited quality for < 30 days of history', () => {
    const history = createHistory(15);
    const result = generateForecast(history, 7);
    expect(result.dataQuality).toBe('limited');
    expect(result.method).toBe('category_average');
    expect(result.predictions).toHaveLength(7);
  });

  it('generates correct number of predictions for 14-day horizon', () => {
    const history = createHistory(35);
    const result = generateForecast(history, 14);
    expect(result.predictions).toHaveLength(14);
    expect(result.horizon).toBe(14);
  });

  it('predictions have low <= expected <= high', () => {
    const history = createHistory(45);
    const result = generateForecast(history, 7);
    for (const pred of result.predictions) {
      expect(pred.low).toBeLessThanOrEqual(pred.expected);
      expect(pred.expected).toBeLessThanOrEqual(pred.high);
    }
  });

  it('all predictions are non-negative', () => {
    const history = createHistory(30);
    const result = generateForecast(history, 14);
    for (const pred of result.predictions) {
      expect(pred.expected).toBeGreaterThanOrEqual(0);
      expect(pred.low).toBeGreaterThanOrEqual(0);
      expect(pred.high).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses category average for limited data when no history', () => {
    const result = generateForecast([], 7, 5.0);
    expect(result.dataQuality).toBe('limited');
    expect(result.predictions[0].expected).toBe(5.0);
  });

  it('handles empty history with no category average', () => {
    const result = generateForecast([], 7);
    expect(result.dataQuality).toBe('limited');
    expect(result.predictions[0].expected).toBe(0);
  });
});

// ─── generateForecastLimited ───────────────────────────────────────────────────

describe('generateForecastLimited', () => {
  it('uses average from available history', () => {
    const history: HistoryPoint[] = [
      { date: new Date('2024-01-01'), quantity: 10 },
      { date: new Date('2024-01-02'), quantity: 20 },
      { date: new Date('2024-01-03'), quantity: 30 },
    ];
    const result = generateForecastLimited(history, 7);
    // Average = 20
    expect(result.predictions[0].expected).toBe(20);
  });
});

// ─── calculateMAPE ─────────────────────────────────────────────────────────────

describe('calculateMAPE', () => {
  it('returns null for empty arrays', () => {
    expect(calculateMAPE([], [])).toBeNull();
  });

  it('returns null for mismatched lengths', () => {
    expect(calculateMAPE([10, 20], [10])).toBeNull();
  });

  it('returns 0 for perfect forecast', () => {
    const actuals = [10, 20, 30, 40];
    const forecasts = [10, 20, 30, 40];
    expect(calculateMAPE(actuals, forecasts)).toBe(0);
  });

  it('calculates correctly for known values', () => {
    // actuals = [100, 200], forecasts = [110, 180]
    // |100-110|/100 = 0.1, |200-180|/200 = 0.1
    // MAPE = (0.1 + 0.1) / 2 * 100 = 10
    const actuals = [100, 200];
    const forecasts = [110, 180];
    expect(calculateMAPE(actuals, forecasts)).toBeCloseTo(10, 5);
  });

  it('ignores zero actuals', () => {
    // Only considers pairs where actual != 0
    const actuals = [0, 100, 200];
    const forecasts = [5, 110, 180];
    // |100-110|/100 = 0.1, |200-180|/200 = 0.1
    // MAPE = (0.1 + 0.1) / 2 * 100 = 10
    expect(calculateMAPE(actuals, forecasts)).toBeCloseTo(10, 5);
  });

  it('returns null when all actuals are zero', () => {
    expect(calculateMAPE([0, 0, 0], [5, 10, 15])).toBeNull();
  });

  it('handles negative actual values with absolute value', () => {
    // |(-100) - (-90)| / |-100| = 10/100 = 0.1
    const actuals = [-100];
    const forecasts = [-90];
    expect(calculateMAPE(actuals, forecasts)).toBeCloseTo(10, 5);
  });
});
