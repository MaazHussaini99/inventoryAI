/**
 * Recommendations module barrel export.
 */

export {
  generateRestockRecommendations,
  generateReduceRecommendations,
  generatePromoteRecommendations,
  generateAllRecommendations,
  calculateConfidence,
  generateExplanation,
  filterEligibleProducts,
} from './engine.js';
export type {
  ProductMetrics,
  Recommendation,
  RecommendationSet,
  ConfidenceLevel,
} from './engine.js';
export { recommendationsRoutes } from './routes.js';
export { registerRecommendationsSubscriber } from './subscriber.js';
