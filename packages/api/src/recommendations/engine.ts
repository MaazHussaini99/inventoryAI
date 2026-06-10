/**
 * Recommendation Generation Engine
 *
 * Pure functions for generating AI-powered inventory recommendations:
 * - "Restock Now": products with critically low days-of-supply (up to 10)
 * - "Reduce or Remove": products with declining sales velocity over 60 days (up to 10)
 * - "Promote This Week": products with rising sales velocity (up to 5)
 *
 * Each recommendation includes a confidence score and one-sentence explanation.
 * Only SKUs with >= 14 days of history are eligible.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface ProductMetrics {
  productId: string;
  productName: string;
  estimatedStock: number;
  averageDailyVelocity: number; // units/day over last 30 days
  previousVelocity: number; // units/day over days 31-60
  daysOfHistory: number; // total days of sales data
  daysOfSupply: number; // estimatedStock / averageDailyVelocity
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface Recommendation {
  productId: string;
  productName: string;
  type: 'restock' | 'reduce' | 'promote';
  confidence: ConfidenceLevel;
  explanation: string;
  supportingMetrics: Record<string, number>;
}

export interface RecommendationSet {
  restockNow: Recommendation[];
  reduceOrRemove: Recommendation[];
  promoteThisWeek: Recommendation[];
  generatedAt: Date;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MIN_HISTORY_DAYS = 14;
const MAX_RESTOCK = 10;
const MAX_REDUCE = 10;
const MAX_PROMOTE = 5;

/** Days-of-supply threshold below which a product is "critically low" */
const CRITICAL_DAYS_OF_SUPPLY = 7;

// ─── Core Logic ────────────────────────────────────────────────────────────────

/**
 * Filter products that meet the minimum history requirement (>= 14 days).
 */
export function filterEligibleProducts(products: ProductMetrics[]): ProductMetrics[] {
  return products.filter((p) => p.daysOfHistory >= MIN_HISTORY_DAYS);
}

/**
 * Calculate confidence score based on data completeness and velocity consistency.
 *
 * - High: >= 30 days of history AND positive velocity in both periods
 * - Medium: >= 14 days of history AND at least one period has positive velocity
 * - Low: otherwise (14+ days but sparse data)
 */
export function calculateConfidence(metrics: ProductMetrics): ConfidenceLevel {
  const hasSubstantialHistory = metrics.daysOfHistory >= 30;
  const hasCurrentVelocity = metrics.averageDailyVelocity > 0;
  const hasPreviousVelocity = metrics.previousVelocity > 0;

  if (hasSubstantialHistory && hasCurrentVelocity && hasPreviousVelocity) {
    return 'high';
  }
  if (hasCurrentVelocity || hasPreviousVelocity) {
    return 'medium';
  }
  return 'low';
}

/**
 * Generate a one-sentence explanation for a recommendation.
 */
export function generateExplanation(
  type: 'restock' | 'reduce' | 'promote',
  productName: string,
  metrics: ProductMetrics
): string {
  switch (type) {
    case 'restock': {
      const days = metrics.daysOfSupply < 1
        ? 'less than 1 day'
        : `${Math.round(metrics.daysOfSupply)} days`;
      return `${productName} has only ${days} of supply remaining at current sales velocity of ${metrics.averageDailyVelocity.toFixed(1)} units/day.`;
    }
    case 'reduce': {
      const declinePercent = metrics.previousVelocity > 0
        ? Math.round(((metrics.previousVelocity - metrics.averageDailyVelocity) / metrics.previousVelocity) * 100)
        : 100;
      return `${productName} sales velocity declined ${declinePercent}% over the past 60 days, suggesting reduced demand.`;
    }
    case 'promote': {
      const increasePercent = metrics.previousVelocity > 0
        ? Math.round(((metrics.averageDailyVelocity - metrics.previousVelocity) / metrics.previousVelocity) * 100)
        : 100;
      return `${productName} sales velocity increased ${increasePercent}% recently, indicating rising demand worth promoting.`;
    }
  }
}

/**
 * Generate "Restock Now" recommendations.
 *
 * Identifies products with critically low days-of-supply (< 7 days),
 * returns up to 10 sorted by urgency (lowest days-of-supply first).
 *
 * Validates: Requirements 6.1
 */
export function generateRestockRecommendations(products: ProductMetrics[]): Recommendation[] {
  const eligible = filterEligibleProducts(products);

  // Filter products with critically low days-of-supply
  const criticalProducts = eligible.filter(
    (p) => p.daysOfSupply < CRITICAL_DAYS_OF_SUPPLY && p.averageDailyVelocity > 0
  );

  // Sort by days-of-supply ascending (most urgent first)
  const sorted = [...criticalProducts].sort((a, b) => a.daysOfSupply - b.daysOfSupply);

  // Take top 10
  return sorted.slice(0, MAX_RESTOCK).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    type: 'restock' as const,
    confidence: calculateConfidence(p),
    explanation: generateExplanation('restock', p.productName, p),
    supportingMetrics: {
      daysOfSupply: Math.round(p.daysOfSupply * 100) / 100,
      estimatedStock: p.estimatedStock,
      averageDailyVelocity: Math.round(p.averageDailyVelocity * 100) / 100,
    },
  }));
}

/**
 * Generate "Reduce or Remove" recommendations.
 *
 * Identifies products with declining sales velocity over 60 days
 * (current 30d velocity < previous 30d velocity), returns up to 10
 * sorted by largest velocity decline.
 *
 * Validates: Requirements 6.2
 */
export function generateReduceRecommendations(products: ProductMetrics[]): Recommendation[] {
  const eligible = filterEligibleProducts(products);

  // Filter products with declining velocity (current < previous)
  const decliningProducts = eligible.filter(
    (p) => p.averageDailyVelocity < p.previousVelocity && p.daysOfHistory >= 60
  );

  // Sort by largest decline ratio (most declined first)
  const sorted = [...decliningProducts].sort((a, b) => {
    const declineA = a.previousVelocity > 0
      ? (a.previousVelocity - a.averageDailyVelocity) / a.previousVelocity
      : 0;
    const declineB = b.previousVelocity > 0
      ? (b.previousVelocity - b.averageDailyVelocity) / b.previousVelocity
      : 0;
    return declineB - declineA;
  });

  // Take top 10
  return sorted.slice(0, MAX_REDUCE).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    type: 'reduce' as const,
    confidence: calculateConfidence(p),
    explanation: generateExplanation('reduce', p.productName, p),
    supportingMetrics: {
      averageDailyVelocity: Math.round(p.averageDailyVelocity * 100) / 100,
      previousVelocity: Math.round(p.previousVelocity * 100) / 100,
      declinePercent: p.previousVelocity > 0
        ? Math.round(((p.previousVelocity - p.averageDailyVelocity) / p.previousVelocity) * 100)
        : 100,
    },
  }));
}

/**
 * Generate "Promote This Week" recommendations.
 *
 * Identifies products with rising sales velocity (current > previous),
 * returns up to 5 sorted by largest velocity increase.
 *
 * Validates: Requirements 6.3
 */
export function generatePromoteRecommendations(products: ProductMetrics[]): Recommendation[] {
  const eligible = filterEligibleProducts(products);

  // Filter products with rising velocity (current > previous)
  const risingProducts = eligible.filter(
    (p) => p.averageDailyVelocity > p.previousVelocity
  );

  // Sort by largest increase ratio (most increased first)
  const sorted = [...risingProducts].sort((a, b) => {
    const increaseA = a.previousVelocity > 0
      ? (a.averageDailyVelocity - a.previousVelocity) / a.previousVelocity
      : a.averageDailyVelocity;
    const increaseB = b.previousVelocity > 0
      ? (b.averageDailyVelocity - b.previousVelocity) / b.previousVelocity
      : b.averageDailyVelocity;
    return increaseB - increaseA;
  });

  // Take top 5
  return sorted.slice(0, MAX_PROMOTE).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    type: 'promote' as const,
    confidence: calculateConfidence(p),
    explanation: generateExplanation('promote', p.productName, p),
    supportingMetrics: {
      averageDailyVelocity: Math.round(p.averageDailyVelocity * 100) / 100,
      previousVelocity: Math.round(p.previousVelocity * 100) / 100,
      increasePercent: p.previousVelocity > 0
        ? Math.round(((p.averageDailyVelocity - p.previousVelocity) / p.previousVelocity) * 100)
        : 100,
    },
  }));
}

/**
 * Generate all recommendations for a given set of product metrics.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */
export function generateAllRecommendations(products: ProductMetrics[]): RecommendationSet {
  return {
    restockNow: generateRestockRecommendations(products),
    reduceOrRemove: generateReduceRecommendations(products),
    promoteThisWeek: generatePromoteRecommendations(products),
    generatedAt: new Date(),
  };
}
