/**
 * Column mapping auto-suggest logic.
 *
 * Compares uploaded file headers against known standard field names
 * using keyword-based matching with normalized, case-insensitive comparison.
 */

import type { ColumnMapping, StandardField } from '@grocery-intel/shared';

/**
 * Mapping rules: keywords that map to standard fields.
 * Each standard field has a set of keywords/substrings that indicate a match.
 */
const FIELD_KEYWORDS: Record<StandardField, string[]> = {
  product_name: ['product', 'item', 'name', 'description', 'product_name', 'item_name'],
  sku_id: ['sku', 'upc', 'barcode', 'code', 'sku_id', 'product_code', 'item_code', 'identifier'],
  quantity_sold: ['qty', 'quantity', 'units', 'sold', 'quantity_sold', 'units_sold', 'amount_sold'],
  sale_price: ['price', 'amount', 'cost', 'revenue', 'sale_price', 'unit_price', 'total'],
  sale_date: ['date', 'time', 'day', 'when', 'sale_date', 'transaction_date', 'sold_date'],
  category: ['category', 'type', 'dept', 'department', 'group', 'class'],
  supplier_name: ['supplier', 'vendor', 'source', 'supplier_name', 'vendor_name', 'manufacturer'],
};

/**
 * Normalize a header string for comparison:
 * - Lowercase
 * - Replace separators (_, -, .) with spaces
 * - Trim extra whitespace
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate a confidence score for a header-to-field match.
 * Returns a value between 0 and 1.
 *
 * Scoring:
 * - Exact match (normalized header equals a normalized keyword): 1.0
 * - Header contains a keyword as a whole word: 0.85
 * - Header contains a keyword as substring: 0.65
 */
function calculateConfidence(normalizedHeader: string, keywords: string[]): number {
  const headerWords = normalizedHeader.split(' ');

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.replace(/[_\-.]/g, ' ').trim();
    // Exact match with the full header (after normalizing the keyword too)
    if (normalizedHeader === normalizedKeyword) {
      return 1.0;
    }
  }

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.replace(/[_\-.]/g, ' ').trim();
    // Single-word keyword appears as a whole word within the header
    if (!normalizedKeyword.includes(' ') && headerWords.includes(normalizedKeyword)) {
      return 0.85;
    }
    // Multi-word keyword is contained within the header
    if (normalizedKeyword.includes(' ') && normalizedHeader.includes(normalizedKeyword)) {
      return 0.85;
    }
  }

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.replace(/[_\-.]/g, ' ').trim();
    // Keyword appears as substring
    if (normalizedHeader.includes(normalizedKeyword)) {
      return 0.65;
    }
  }

  return 0;
}

/**
 * Suggest column mappings for a set of file headers.
 * Returns a mapping suggestion for each header that has a reasonable match.
 * Each header is mapped to at most one standard field (best match).
 * Each standard field is mapped from at most one header (highest confidence wins).
 */
export function suggestColumnMappings(headers: string[]): ColumnMapping[] {
  // Calculate all possible matches with confidence scores
  const candidates: Array<{
    source_column: string;
    target_field: StandardField;
    confidence: number;
  }> = [];

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;

    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      const confidence = calculateConfidence(normalized, keywords);
      if (confidence > 0) {
        candidates.push({
          source_column: header,
          target_field: field as StandardField,
          confidence,
        });
      }
    }
  }

  // Sort by confidence descending to pick best matches first
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Greedily assign: each header and each field can only be used once
  const usedHeaders = new Set<string>();
  const usedFields = new Set<string>();
  const mappings: ColumnMapping[] = [];

  for (const candidate of candidates) {
    if (usedHeaders.has(candidate.source_column)) continue;
    if (usedFields.has(candidate.target_field)) continue;

    mappings.push({
      source_column: candidate.source_column,
      target_field: candidate.target_field,
      confidence: candidate.confidence,
    });

    usedHeaders.add(candidate.source_column);
    usedFields.add(candidate.target_field);
  }

  return mappings;
}
