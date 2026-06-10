/**
 * Sales Analytics module barrel export.
 *
 * Exports the sales intelligence engine functions and the analytics
 * event subscriber that listens for 'data.normalized' events and
 * emits 'analytics.updated' upon completion.
 */

export {
  calculateDailyAnalytics,
  getTopProducts,
  getDeadStock,
  getDailyTrends,
} from './sales-engine.js';

export type {
  DateRange,
  DailyAnalytics,
  TopProduct,
  DeadStockItem,
  DailyTrend,
  SortBy,
} from './sales-engine.js';

export { registerAnalyticsSubscriber } from './subscriber.js';

export { analyticsRoutes } from './routes.js';
