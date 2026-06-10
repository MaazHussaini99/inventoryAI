/**
 * Reorder Point Calculation Engine
 *
 * Pure functions for calculating reorder points, safety stock,
 * and suggested order quantities:
 * - Reorder point: (average_daily_sales × lead_time_days) + safety_stock
 * - Safety stock: z_score(service_level) × demand_std_dev × √(lead_time_days)
 * - Suggested order quantity: avg_daily × (lead_time + review_period) - current_stock + safety_stock
 * - Default lead times: 3 days local, 7 days non-local
 * - Days until stockout for urgency sorting
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface ReorderConfig {
  leadTimeDays: number;
  serviceLevel: number; // 0.0-1.0, default 0.95
  reviewPeriodDays: number; // default 7
}

export interface ReorderInput {
  productId: string;
  productName: string;
  averageDailySales: number;
  demandStdDev: number;
  currentStock: number;
  isLocal: boolean;
  config?: Partial<ReorderConfig>;
}

export interface ReorderResult {
  productId: string;
  productName: string;
  reorderPoint: number;
  safetyStock: number;
  suggestedOrderQty: number;
  leadTimeDays: number;
  serviceLevel: number;
  reviewPeriodDays: number;
  averageDailySales: number;
  currentStock: number;
  daysUntilStockout: number | null;
  urgency: 'critical' | 'high' | 'medium' | 'low';
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_LEAD_TIME_LOCAL = 3;
const DEFAULT_LEAD_TIME_NON_LOCAL = 7;
const DEFAULT_SERVICE_LEVEL = 0.95;
const DEFAULT_REVIEW_PERIOD = 7;

// ─── Z-Score Lookup ────────────────────────────────────────────────────────────

/**
 * Approximate z-score for a given service level (cumulative normal distribution).
 * Uses rational approximation for the inverse normal CDF.
 *
 * Common values:
 * - 0.90 → 1.282
 * - 0.95 → 1.645
 * - 0.99 → 2.326
 */
export function zScore(serviceLevel: number): number {
  // Clamp to valid range
  const p = Math.max(0.5, Math.min(0.9999, serviceLevel));

  // Rational approximation of the inverse normal CDF (Abramowitz and Stegun)
  const t = Math.sqrt(-2 * Math.log(1 - p));

  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
}

// ─── Core Calculations ─────────────────────────────────────────────────────────

/**
 * Get default lead time based on supplier locality.
 * - Local supplier: 3 days
 * - Non-local supplier: 7 days
 *
 * Validates: Requirements 8.4
 */
export function getDefaultLeadTime(isLocal: boolean): number {
  return isLocal ? DEFAULT_LEAD_TIME_LOCAL : DEFAULT_LEAD_TIME_NON_LOCAL;
}

/**
 * Calculate safety stock.
 * safety_stock = z_score(service_level) × demand_std_dev × √(lead_time_days)
 *
 * Validates: Requirements 8.2
 */
export function calculateSafetyStock(
  demandStdDev: number,
  leadTimeDays: number,
  serviceLevel: number
): number {
  const z = zScore(serviceLevel);
  return z * demandStdDev * Math.sqrt(leadTimeDays);
}

/**
 * Calculate reorder point.
 * reorder_point = (average_daily_sales × lead_time_days) + safety_stock
 *
 * Validates: Requirements 8.1
 */
export function calculateReorderPoint(
  averageDailySales: number,
  leadTimeDays: number,
  safetyStock: number
): number {
  return averageDailySales * leadTimeDays + safetyStock;
}

/**
 * Calculate suggested order quantity.
 * qty = average_daily_sales × (lead_time_days + review_period_days) - current_stock + safety_stock
 *
 * Validates: Requirements 8.5
 */
export function calculateOrderQuantity(
  averageDailySales: number,
  leadTimeDays: number,
  reviewPeriodDays: number,
  currentStock: number,
  safetyStock: number
): number {
  const qty =
    averageDailySales * (leadTimeDays + reviewPeriodDays) - currentStock + safetyStock;
  return Math.max(0, qty);
}

/**
 * Calculate estimated days until stockout.
 * Returns null if average daily sales is 0 (no stockout risk).
 *
 * Validates: Requirements 8.6
 */
export function calculateDaysUntilStockout(
  currentStock: number,
  averageDailySales: number
): number | null {
  if (averageDailySales <= 0) {
    return currentStock > 0 ? null : 0;
  }
  return Math.max(0, currentStock / averageDailySales);
}

/**
 * Determine urgency level based on days until stockout.
 * - critical: <= 2 days
 * - high: <= 5 days
 * - medium: <= 10 days
 * - low: > 10 days or null (no stockout risk)
 */
export function determineUrgency(
  daysUntilStockout: number | null
): 'critical' | 'high' | 'medium' | 'low' {
  if (daysUntilStockout === null) return 'low';
  if (daysUntilStockout <= 2) return 'critical';
  if (daysUntilStockout <= 5) return 'high';
  if (daysUntilStockout <= 10) return 'medium';
  return 'low';
}

/**
 * Calculate full reorder metrics for a product.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export function calculateReorderMetrics(input: ReorderInput): ReorderResult {
  const leadTimeDays = input.config?.leadTimeDays ?? getDefaultLeadTime(input.isLocal);
  const serviceLevel = input.config?.serviceLevel ?? DEFAULT_SERVICE_LEVEL;
  const reviewPeriodDays = input.config?.reviewPeriodDays ?? DEFAULT_REVIEW_PERIOD;

  const safetyStock = calculateSafetyStock(
    input.demandStdDev,
    leadTimeDays,
    serviceLevel
  );

  const reorderPoint = calculateReorderPoint(
    input.averageDailySales,
    leadTimeDays,
    safetyStock
  );

  const suggestedOrderQty = calculateOrderQuantity(
    input.averageDailySales,
    leadTimeDays,
    reviewPeriodDays,
    input.currentStock,
    safetyStock
  );

  const daysUntilStockout = calculateDaysUntilStockout(
    input.currentStock,
    input.averageDailySales
  );

  const urgency = determineUrgency(daysUntilStockout);

  return {
    productId: input.productId,
    productName: input.productName,
    reorderPoint: Math.round(reorderPoint * 100) / 100,
    safetyStock: Math.round(safetyStock * 100) / 100,
    suggestedOrderQty: Math.round(suggestedOrderQty * 100) / 100,
    leadTimeDays,
    serviceLevel,
    reviewPeriodDays,
    averageDailySales: input.averageDailySales,
    currentStock: input.currentStock,
    daysUntilStockout:
      daysUntilStockout !== null
        ? Math.round(daysUntilStockout * 100) / 100
        : null,
    urgency,
  };
}

/**
 * Sort reorder results by urgency (ascending days until stockout).
 * Products with null daysUntilStockout (no stockout risk) go last.
 *
 * Validates: Requirements 8.6
 */
export function sortByUrgency(results: ReorderResult[]): ReorderResult[] {
  return [...results].sort((a, b) => {
    // null goes to the end
    if (a.daysUntilStockout === null && b.daysUntilStockout === null) return 0;
    if (a.daysUntilStockout === null) return 1;
    if (b.daysUntilStockout === null) return -1;
    return a.daysUntilStockout - b.daysUntilStockout;
  });
}
