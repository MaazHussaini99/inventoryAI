/**
 * Data Normalizer module.
 * Provides date and currency parsing/standardization utilities,
 * fuzzy duplicate detection, and data quality scoring
 * used by the data normalization plugin.
 */

export { parseDate, isDateFlaggable } from './date-parser.js';
export type { ParsedDate, DateParseOptions } from './date-parser.js';

export { parseCurrency } from './currency-parser.js';

export { calculateSimilarity, detectDuplicates } from './duplicate-detector.js';
export type { DuplicatePair, ProductInput } from './duplicate-detector.js';

export { calculateQualityScore } from './quality-scorer.js';
export type { QualityScore, QualityDetail, ImportRecord } from './quality-scorer.js';
