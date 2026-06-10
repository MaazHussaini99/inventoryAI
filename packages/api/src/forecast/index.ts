/**
 * Forecast module barrel export.
 */

export {
  generateForecast,
  generateForecastFull,
  generateForecastLimited,
  calculateMAPE,
  trendDecomposition,
  standardDeviation,
} from './engine.js';
export type {
  HistoryPoint,
  DailyPrediction,
  DataQuality,
  ForecastMethod,
  ForecastResult,
  Horizon,
  TrendDecomposition,
} from './engine.js';
export { forecastRoutes } from './routes.js';
export { registerForecastSubscriber } from './subscriber.js';
