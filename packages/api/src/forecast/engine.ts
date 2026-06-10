/**
 * Demand Forecasting Engine
 *
 * Pure functions for generating demand forecasts:
 * - Trend decomposition with day-of-week seasonality
 * - 7-day and 14-day forecasts with confidence intervals (low, expected, high)
 * - Data sufficiency handling: full forecasts (>= 30 days), limited-data estimates (< 30 days)
 * - MAPE calculation when actuals become available
 *
 * Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.6
 */

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface HistoryPoint {
  date: Date;
  quantity: number;
}

export interface DailyPrediction {
  date: Date;
  expected: number;
  low: number;
  high: number;
}

export type DataQuality = 'full' | 'limited';
export type ForecastMethod = 'trend_decomposition' | 'category_average';
export type Horizon = 7 | 14;

export interface ForecastResult {
  predictions: DailyPrediction[];
  method: ForecastMethod;
  dataQuality: DataQuality;
  horizon: Horizon;
}

export interface TrendDecomposition {
  trend: number[];
  seasonal: number[]; // Length 7 (one per day-of-week: 0=Sunday..6=Saturday)
  residual: number[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MIN_HISTORY_DAYS_FULL = 30;
const CONFIDENCE_MULTIPLIER = 1.96; // ~95% confidence interval (z=1.96)

// ─── Core Logic ────────────────────────────────────────────────────────────────

/**
 * Decompose a time series into trend + day-of-week seasonal components + residual.
 *
 * Uses a simple moving average for trend, then computes seasonal factors
 * as the average deviation from trend for each day of the week.
 */
export function trendDecomposition(history: HistoryPoint[]): TrendDecomposition {
  if (history.length === 0) {
    return { trend: [], seasonal: new Array(7).fill(0), residual: [] };
  }

  const quantities = history.map((h) => h.quantity);

  // Calculate trend using 7-day centered moving average
  const windowSize = Math.min(7, quantities.length);
  const trend: number[] = [];

  for (let i = 0; i < quantities.length; i++) {
    const halfWindow = Math.floor(windowSize / 2);
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(quantities.length, i + halfWindow + 1);
    const window = quantities.slice(start, end);
    const avg = window.reduce((sum, v) => sum + v, 0) / window.length;
    trend.push(avg);
  }

  // Calculate seasonal component: average deviation from trend for each day-of-week
  const seasonalSums = new Array(7).fill(0);
  const seasonalCounts = new Array(7).fill(0);

  for (let i = 0; i < history.length; i++) {
    const dayOfWeek = history[i].date.getDay();
    const deviation = quantities[i] - trend[i];
    seasonalSums[dayOfWeek] += deviation;
    seasonalCounts[dayOfWeek]++;
  }

  const seasonal: number[] = seasonalSums.map((sum, idx) =>
    seasonalCounts[idx] > 0 ? sum / seasonalCounts[idx] : 0
  );

  // Calculate residual
  const residual: number[] = quantities.map((q, i) => {
    const dayOfWeek = history[i].date.getDay();
    return q - trend[i] - seasonal[dayOfWeek];
  });

  return { trend, seasonal, residual };
}

/**
 * Calculate the standard deviation of an array of numbers.
 */
export function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Generate a forecast using trend decomposition with day-of-week seasonality.
 *
 * The forecast extrapolates the trend linearly and adds seasonal factors.
 * Confidence intervals are based on residual standard deviation.
 *
 * Validates: Requirements 7.1, 7.2, 7.4
 */
export function generateForecastFull(
  history: HistoryPoint[],
  horizon: Horizon
): ForecastResult {
  const decomposition = trendDecomposition(history);
  const { trend, seasonal, residual } = decomposition;

  // Calculate trend slope (linear extrapolation)
  const recentTrendWindow = Math.min(14, trend.length);
  const recentTrend = trend.slice(-recentTrendWindow);
  const trendSlope =
    recentTrend.length > 1
      ? (recentTrend[recentTrend.length - 1] - recentTrend[0]) / (recentTrend.length - 1)
      : 0;

  const lastTrendValue = trend[trend.length - 1] ?? 0;
  const residualStd = standardDeviation(residual);

  // Get the last date in history
  const lastDate = history[history.length - 1].date;

  const predictions: DailyPrediction[] = [];

  for (let day = 1; day <= horizon; day++) {
    const futureDate = new Date(lastDate.getTime() + day * 24 * 60 * 60 * 1000);
    const dayOfWeek = futureDate.getDay();

    // Expected = extrapolated trend + seasonal factor
    const trendForecast = lastTrendValue + trendSlope * day;
    const expected = Math.max(0, trendForecast + seasonal[dayOfWeek]);

    // Confidence interval widens with forecast horizon
    const uncertaintyMultiplier = Math.sqrt(day);
    const margin = CONFIDENCE_MULTIPLIER * residualStd * uncertaintyMultiplier;

    const low = Math.max(0, expected - margin);
    const high = Math.max(0, expected + margin);

    predictions.push({
      date: futureDate,
      expected: Math.round(expected * 100) / 100,
      low: Math.round(low * 100) / 100,
      high: Math.round(high * 100) / 100,
    });
  }

  return {
    predictions,
    method: 'trend_decomposition',
    dataQuality: 'full',
    horizon,
  };
}

/**
 * Generate a limited-data estimate using category averages.
 *
 * When a SKU has < 30 days of history, we use whatever data is available
 * combined with category-level averages to produce a rough estimate.
 *
 * Validates: Requirements 7.5
 */
export function generateForecastLimited(
  history: HistoryPoint[],
  horizon: Horizon,
  categoryAvgDaily?: number
): ForecastResult {
  // Use available history or category average
  let avgDaily: number;
  if (history.length > 0) {
    const totalQty = history.reduce((sum, h) => sum + h.quantity, 0);
    avgDaily = totalQty / history.length;
  } else if (categoryAvgDaily !== undefined && categoryAvgDaily > 0) {
    avgDaily = categoryAvgDaily;
  } else {
    avgDaily = 0;
  }

  // Simple flat forecast with wide confidence intervals
  const lastDate =
    history.length > 0
      ? history[history.length - 1].date
      : new Date();

  // Use larger uncertainty for limited data
  const uncertainty = avgDaily * 0.5; // 50% uncertainty

  const predictions: DailyPrediction[] = [];

  for (let day = 1; day <= horizon; day++) {
    const futureDate = new Date(lastDate.getTime() + day * 24 * 60 * 60 * 1000);

    const expected = Math.max(0, avgDaily);
    const low = Math.max(0, avgDaily - uncertainty);
    const high = Math.max(0, avgDaily + uncertainty);

    predictions.push({
      date: futureDate,
      expected: Math.round(expected * 100) / 100,
      low: Math.round(low * 100) / 100,
      high: Math.round(high * 100) / 100,
    });
  }

  return {
    predictions,
    method: 'category_average',
    dataQuality: 'limited',
    horizon,
  };
}

/**
 * Main forecast generation entry point.
 *
 * Determines data sufficiency and routes to the appropriate forecast method:
 * - >= 30 days history → full trend decomposition forecast
 * - < 30 days history → limited-data estimate using category averages
 *
 * Validates: Requirements 7.1, 7.5
 */
export function generateForecast(
  history: HistoryPoint[],
  horizon: Horizon,
  categoryAvgDaily?: number
): ForecastResult {
  if (history.length >= MIN_HISTORY_DAYS_FULL) {
    return generateForecastFull(history, horizon);
  }
  return generateForecastLimited(history, horizon, categoryAvgDaily);
}

/**
 * Calculate MAPE (Mean Absolute Percentage Error).
 *
 * MAPE = (1/n) × Σ(|actual_i - forecast_i| / |actual_i|) × 100
 *
 * Only considers pairs where actual is non-zero.
 *
 * Validates: Requirements 7.6
 */
export function calculateMAPE(
  actuals: number[],
  forecasts: number[]
): number | null {
  if (actuals.length === 0 || actuals.length !== forecasts.length) {
    return null;
  }

  // Filter out zero actuals (MAPE is undefined for zero actuals)
  const validPairs: Array<{ actual: number; forecast: number }> = [];
  for (let i = 0; i < actuals.length; i++) {
    if (actuals[i] !== 0) {
      validPairs.push({ actual: actuals[i], forecast: forecasts[i] });
    }
  }

  if (validPairs.length === 0) {
    return null;
  }

  const sumAbsPercentError = validPairs.reduce((sum, { actual, forecast }) => {
    return sum + Math.abs(actual - forecast) / Math.abs(actual);
  }, 0);

  return (sumAbsPercentError / validPairs.length) * 100;
}
