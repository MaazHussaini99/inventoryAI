/**
 * Data quality scoring for the Data Normalizer plugin.
 * Calculates completeness, consistency, and validity scores for imported records.
 *
 * Validates: Requirements 3.6
 */

/**
 * Represents a single imported record for quality assessment.
 */
export interface ImportRecord {
  product_name?: string | null;
  quantity_sold?: number | null;
  sku_id?: string | null;
  sale_price?: number | null;
  sale_date?: string | null;
  category?: string | null;
  supplier_name?: string | null;
}

/**
 * Detail about a specific quality issue found in the data.
 */
export interface QualityDetail {
  field: string;
  issue: string;
  affectedRecords: number;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Overall quality score breakdown.
 */
export interface QualityScore {
  overall: number;
  completeness: number;
  consistency: number;
  validity: number;
  details: QualityDetail[];
}

const REQUIRED_FIELDS: (keyof ImportRecord)[] = ['product_name', 'quantity_sold'];
const OPTIONAL_FIELDS: (keyof ImportRecord)[] = [
  'sku_id',
  'sale_price',
  'sale_date',
  'category',
  'supplier_name',
];

/**
 * Calculate the data quality score for a set of imported records.
 *
 * - Completeness (40% weight): percentage of required/optional fields filled
 * - Consistency (30% weight): format uniformity for dates and currencies
 * - Validity (30% weight): range checks (positive quantities, valid dates, reasonable prices)
 * - Overall = weighted average of sub-scores
 *
 * @returns QualityScore with overall, completeness, consistency, validity, and details
 */
export function calculateQualityScore(records: ImportRecord[]): QualityScore {
  if (records.length === 0) {
    return {
      overall: 0,
      completeness: 0,
      consistency: 0,
      validity: 0,
      details: [],
    };
  }

  const details: QualityDetail[] = [];

  const completeness = calculateCompleteness(records, details);
  const consistency = calculateConsistency(records, details);
  const validity = calculateValidity(records, details);

  // Weighted average: completeness 40%, consistency 30%, validity 30%
  const overall = Math.round(completeness * 0.4 + consistency * 0.3 + validity * 0.3);

  return {
    overall: clampScore(overall),
    completeness: clampScore(Math.round(completeness)),
    consistency: clampScore(Math.round(consistency)),
    validity: clampScore(Math.round(validity)),
    details,
  };
}

/**
 * Calculate completeness score.
 * Required fields (product_name, quantity_sold) are weighted more heavily.
 * Optional fields contribute proportionally.
 */
function calculateCompleteness(records: ImportRecord[], details: QualityDetail[]): number {
  const totalRecords = records.length;

  // Required fields: each contributes equally to 70% of the completeness score
  let requiredFilledCount = 0;
  const requiredTotal = totalRecords * REQUIRED_FIELDS.length;

  for (const record of records) {
    for (const field of REQUIRED_FIELDS) {
      if (isFieldFilled(record[field])) {
        requiredFilledCount++;
      }
    }
  }

  const requiredScore = requiredTotal > 0 ? (requiredFilledCount / requiredTotal) * 100 : 100;

  // Optional fields: each contributes equally to 30% of the completeness score
  let optionalFilledCount = 0;
  const optionalTotal = totalRecords * OPTIONAL_FIELDS.length;

  for (const record of records) {
    for (const field of OPTIONAL_FIELDS) {
      if (isFieldFilled(record[field])) {
        optionalFilledCount++;
      }
    }
  }

  const optionalScore = optionalTotal > 0 ? (optionalFilledCount / optionalTotal) * 100 : 100;

  // Track details for missing required fields
  for (const field of REQUIRED_FIELDS) {
    const missing = records.filter((r) => !isFieldFilled(r[field])).length;
    if (missing > 0) {
      details.push({
        field,
        issue: `Missing required field '${field}'`,
        affectedRecords: missing,
        severity: 'high',
      });
    }
  }

  // Track details for missing optional fields
  for (const field of OPTIONAL_FIELDS) {
    const missing = records.filter((r) => !isFieldFilled(r[field])).length;
    if (missing > 0 && missing > totalRecords * 0.5) {
      details.push({
        field,
        issue: `Missing optional field '${field}' in majority of records`,
        affectedRecords: missing,
        severity: 'low',
      });
    }
  }

  // Combined: 70% required, 30% optional
  return requiredScore * 0.7 + optionalScore * 0.3;
}

/**
 * Calculate consistency score.
 * Measures format uniformity for dates and currencies across records.
 */
function calculateConsistency(records: ImportRecord[], details: QualityDetail[]): number {
  const totalRecords = records.length;
  let consistentRecords = 0;

  // Detect the dominant date format
  const dateFormats = detectDateFormats(records);
  const dominantDateFormat = getMostCommon(dateFormats);

  // Detect the dominant currency format
  const currencyFormats = detectCurrencyFormats(records);
  const dominantCurrencyFormat = getMostCommon(currencyFormats);

  for (const record of records) {
    let isConsistent = true;

    // Check date format consistency
    if (record.sale_date && dominantDateFormat) {
      const format = classifyDateFormat(record.sale_date);
      if (format && format !== dominantDateFormat) {
        isConsistent = false;
      }
    }

    // Check currency format consistency
    if (record.sale_price !== null && record.sale_price !== undefined) {
      const priceStr = String(record.sale_price);
      const format = classifyCurrencyFormat(priceStr);
      if (format && dominantCurrencyFormat && format !== dominantCurrencyFormat) {
        isConsistent = false;
      }
    }

    if (isConsistent) {
      consistentRecords++;
    }
  }

  const score = (consistentRecords / totalRecords) * 100;

  // Track inconsistency details
  const inconsistentDateCount = records.filter((r) => {
    if (!r.sale_date || !dominantDateFormat) return false;
    const format = classifyDateFormat(r.sale_date);
    return format && format !== dominantDateFormat;
  }).length;

  if (inconsistentDateCount > 0) {
    details.push({
      field: 'sale_date',
      issue: 'Inconsistent date formats detected',
      affectedRecords: inconsistentDateCount,
      severity: 'medium',
    });
  }

  return score;
}

/**
 * Calculate validity score.
 * Checks range validity: positive quantities, valid dates, reasonable prices.
 */
function calculateValidity(records: ImportRecord[], details: QualityDetail[]): number {
  const totalRecords = records.length;
  let validRecords = 0;

  let invalidQuantityCount = 0;
  let invalidDateCount = 0;
  let invalidPriceCount = 0;

  for (const record of records) {
    let isValid = true;

    // Check quantity is positive (if present)
    if (record.quantity_sold !== null && record.quantity_sold !== undefined) {
      if (typeof record.quantity_sold !== 'number' || record.quantity_sold <= 0) {
        isValid = false;
        invalidQuantityCount++;
      }
    }

    // Check date validity (if present)
    if (record.sale_date) {
      if (!isValidDateString(record.sale_date)) {
        isValid = false;
        invalidDateCount++;
      }
    }

    // Check price is reasonable (if present): positive, not excessively large
    if (record.sale_price !== null && record.sale_price !== undefined) {
      const price = typeof record.sale_price === 'number' ? record.sale_price : NaN;
      if (isNaN(price) || price < 0 || price > 100000) {
        isValid = false;
        invalidPriceCount++;
      }
    }

    if (isValid) {
      validRecords++;
    }
  }

  const score = (validRecords / totalRecords) * 100;

  if (invalidQuantityCount > 0) {
    details.push({
      field: 'quantity_sold',
      issue: 'Invalid quantity (non-positive or non-numeric)',
      affectedRecords: invalidQuantityCount,
      severity: 'high',
    });
  }

  if (invalidDateCount > 0) {
    details.push({
      field: 'sale_date',
      issue: 'Invalid date format',
      affectedRecords: invalidDateCount,
      severity: 'medium',
    });
  }

  if (invalidPriceCount > 0) {
    details.push({
      field: 'sale_price',
      issue: 'Invalid price (negative or unreasonably high)',
      affectedRecords: invalidPriceCount,
      severity: 'medium',
    });
  }

  return score;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim().length === 0) return false;
  return true;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

type DateFormatType = 'iso' | 'us-slash' | 'eu-slash' | 'dd-mon-yyyy' | 'unknown';

function classifyDateFormat(dateStr: string): DateFormatType | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) return 'iso';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return 'us-slash';
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) return 'eu-slash';
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)) return 'dd-mon-yyyy';
  return 'unknown';
}

type CurrencyFormatType = 'plain' | 'with-symbol' | 'with-commas' | 'european' | 'unknown';

function classifyCurrencyFormat(priceStr: string): CurrencyFormatType | null {
  if (!priceStr || typeof priceStr !== 'string') return null;
  const trimmed = priceStr.trim();
  if (/^[\d]+(\.\d+)?$/.test(trimmed)) return 'plain';
  if (/^[$€£¥]/.test(trimmed)) return 'with-symbol';
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(trimmed)) return 'with-commas';
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(trimmed)) return 'european';
  return 'unknown';
}

function detectDateFormats(records: ImportRecord[]): string[] {
  const formats: string[] = [];
  for (const record of records) {
    if (record.sale_date) {
      const format = classifyDateFormat(record.sale_date);
      if (format && format !== 'unknown') {
        formats.push(format);
      }
    }
  }
  return formats;
}

function detectCurrencyFormats(records: ImportRecord[]): string[] {
  const formats: string[] = [];
  for (const record of records) {
    if (record.sale_price !== null && record.sale_price !== undefined) {
      const priceStr = String(record.sale_price);
      const format = classifyCurrencyFormat(priceStr);
      if (format && format !== 'unknown') {
        formats.push(format);
      }
    }
  }
  return formats;
}

function getMostCommon(items: string[]): string | null {
  if (items.length === 0) return null;
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let maxCount = 0;
  let maxItem: string | null = null;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }
  return maxItem;
}

function isValidDateString(dateStr: string): boolean {
  const trimmed = dateStr.trim();
  // Try ISO format
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    return isValidDateParts(year, month, day);
  }
  // Try slash format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return isValidDateParts(year, month, day) || isValidDateParts(year, day, month);
  }
  // Try DD-Mon-YYYY
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(trimmed)) {
    return true; // Basic structural check passes
  }
  // Try numeric dash format
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return isValidDateParts(year, first, second) || isValidDateParts(year, second, first);
  }
  return false;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}
