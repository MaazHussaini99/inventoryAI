/**
 * Currency parsing for the Data Normalizer plugin.
 * Strips currency symbols and formatting, converts to numeric values.
 *
 * Validates: Requirements 3.4
 */

/**
 * Parse a currency string into a numeric value.
 *
 * Handles:
 * - Currency symbols: $, €, £, ¥
 * - Comma-separated thousands (US format): "1,234.56" → 1234.56
 * - European format with dots for thousands and comma for decimal: "1.234,56" → 1234.56
 * - Negative values: "-$5.00" → -5.00, "($5.00)" → -5.00
 * - Whitespace and leading/trailing spaces
 *
 * @returns The numeric value, or null if the input is unparseable
 */
export function parseCurrency(input: string): number | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  let trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Detect negative values
  let isNegative = false;

  // Handle parenthetical negatives: ($5.00) or (5.00)
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    isNegative = true;
    trimmed = trimmed.slice(1, -1).trim();
  }

  // Handle leading minus sign (before or after currency symbol)
  if (trimmed.startsWith('-')) {
    isNegative = true;
    trimmed = trimmed.slice(1).trim();
  }

  // Strip currency symbols
  trimmed = trimmed.replace(/[$€£¥]/g, '').trim();

  // Handle minus after currency symbol: $-5.00 → already stripped $ above
  if (trimmed.startsWith('-')) {
    isNegative = true;
    trimmed = trimmed.slice(1).trim();
  }

  if (trimmed.length === 0) {
    return null;
  }

  // Determine the number format based on separator positions
  const lastDot = trimmed.lastIndexOf('.');
  const lastComma = trimmed.lastIndexOf(',');

  let numericStr: string;

  if (lastComma === -1 && lastDot === -1) {
    // Plain integer, no separators
    numericStr = trimmed;
  } else if (lastComma === -1 && lastDot !== -1) {
    // Only dots present — dot is the decimal separator
    // But handle multiple dots as invalid
    const dotCount = (trimmed.match(/\./g) || []).length;
    if (dotCount > 1) {
      return null;
    }
    numericStr = trimmed;
  } else if (lastDot === -1 && lastComma !== -1) {
    // Only commas present (no dots) — disambiguate thousands vs decimal comma
    const commaCount = (trimmed.match(/,/g) || []).length;
    if (commaCount > 1) {
      // Multiple commas → thousands separators (e.g., "1,000,000")
      numericStr = trimmed.replace(/,/g, '');
    } else {
      // Single comma — check digits after it
      const afterComma = trimmed.slice(lastComma + 1);
      if (afterComma.length === 3 && /^\d+$/.test(afterComma)) {
        // Exactly 3 digits after comma → thousands separator (e.g., "1,000")
        numericStr = trimmed.replace(/,/g, '');
      } else if (afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
        // 1-2 digits after comma → decimal comma (e.g., "5,50")
        numericStr = trimmed.replace(',', '.');
      } else {
        numericStr = trimmed.replace(/,/g, '');
      }
    }
  } else if (lastComma > lastDot) {
    // Both present, comma after dot → European format
    // Dots are thousands separators, comma is decimal (e.g., "1.234,56")
    numericStr = trimmed.replace(/\./g, '').replace(',', '.');
  } else {
    // Both present, dot after comma → US format
    // Commas are thousands separators, dot is decimal (e.g., "1,234.56")
    numericStr = trimmed.replace(/,/g, '');
  }

  // Validate the resulting string is a valid number
  if (!/^\d+(\.\d+)?$/.test(numericStr)) {
    return null;
  }

  const value = parseFloat(numericStr);

  if (isNaN(value) || !isFinite(value)) {
    return null;
  }

  return isNegative ? -value : value;
}
