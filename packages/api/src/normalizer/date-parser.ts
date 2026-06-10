/**
 * Date parsing and validation for the Data Normalizer plugin.
 * Supports multiple date formats common in grocery store data exports.
 *
 * Validates: Requirements 3.3, 3.5
 */

export interface ParsedDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  isoString: string; // YYYY-MM-DD
}

export interface DateParseOptions {
  /** When true, ambiguous dates like 01/02/2024 are parsed as month-first (US format). Default: true */
  preferMonthFirst?: boolean;
}

const MONTH_ABBREVS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Parse a date string into a consistent internal representation.
 *
 * Supported formats:
 * - MM/DD/YYYY or DD/MM/YYYY (ambiguous, resolved by preferMonthFirst option)
 * - YYYY-MM-DD (ISO 8601)
 * - DD-Mon-YYYY (e.g., "15-Jan-2024")
 *
 * @returns ParsedDate if the input is a valid date, null otherwise
 */
export function parseDate(input: string, options?: DateParseOptions): ParsedDate | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const preferMonthFirst = options?.preferMonthFirst ?? true;

  // Try DD-Mon-YYYY format first (e.g., "15-Jan-2024")
  const ddMonYyyyResult = parseDDMonYYYY(trimmed);
  if (ddMonYyyyResult) return ddMonYyyyResult;

  // Try YYYY-MM-DD (ISO 8601)
  const isoResult = parseISO(trimmed);
  if (isoResult) return isoResult;

  // Try slash-separated formats: MM/DD/YYYY or DD/MM/YYYY
  const slashResult = parseSlashFormat(trimmed, preferMonthFirst);
  if (slashResult) return slashResult;

  return null;
}

/**
 * Determines whether a date should be flagged for manual review.
 * A date is flaggable if it is in the future or more than 5 years in the past.
 *
 * @param date - The date to check
 * @param referenceDate - The reference date to compare against (defaults to now)
 * @returns true if the date should be flagged for review
 */
export function isDateFlaggable(date: Date, referenceDate?: Date): boolean {
  const ref = referenceDate ?? new Date();

  // Future date
  if (date.getTime() > ref.getTime()) {
    return true;
  }

  // More than 5 years in the past
  const fiveYearsAgo = new Date(ref);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  if (date.getTime() < fiveYearsAgo.getTime()) {
    return true;
  }

  return false;
}

// ─── Internal parsers ───────────────────────────────────────────────────────────

function parseDDMonYYYY(input: string): ParsedDate | null {
  // Match DD-Mon-YYYY (e.g., "15-Jan-2024" or "3-Feb-2023")
  const match = input.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthStr = match[2].toLowerCase();
  const year = parseInt(match[3], 10);

  const month = MONTH_ABBREVS[monthStr];
  if (month === undefined) return null;

  if (!isValidDate(year, month, day)) return null;

  return buildParsedDate(year, month, day);
}

function parseISO(input: string): ParsedDate | null {
  // Match YYYY-MM-DD
  const match = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (!isValidDate(year, month, day)) return null;

  return buildParsedDate(year, month, day);
}

function parseSlashFormat(input: string, preferMonthFirst: boolean): ParsedDate | null {
  // Match N/N/YYYY or N-N-YYYY (where N is 1-2 digits)
  const match = input.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!match) return null;

  const first = parseInt(match[1], 10);
  const second = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // If first > 12, it must be a day (DD/MM/YYYY)
  if (first > 12 && second <= 12) {
    const day = first;
    const month = second;
    if (!isValidDate(year, month, day)) return null;
    return buildParsedDate(year, month, day);
  }

  // If second > 12, it must be a day (MM/DD/YYYY)
  if (second > 12 && first <= 12) {
    const month = first;
    const day = second;
    if (!isValidDate(year, month, day)) return null;
    return buildParsedDate(year, month, day);
  }

  // Ambiguous case: both values <= 12
  if (preferMonthFirst) {
    // MM/DD/YYYY
    const month = first;
    const day = second;
    if (!isValidDate(year, month, day)) return null;
    return buildParsedDate(year, month, day);
  } else {
    // DD/MM/YYYY
    const day = first;
    const month = second;
    if (!isValidDate(year, month, day)) return null;
    return buildParsedDate(year, month, day);
  }
}

function buildParsedDate(year: number, month: number, day: number): ParsedDate {
  const isoString = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  return { year, month, day, isoString };
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}
