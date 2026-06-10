/**
 * File parser module for CSV and Excel files.
 * Supports:
 *   - CSV via Papa Parse (streaming for large files)
 *   - XLSX/XLS via ExcelJS
 *
 * Returns parsed headers and sample rows for the column mapping preview.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import type { FileFormat } from '@grocery-intel/shared';

export interface ParseResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
}

const SAMPLE_ROW_COUNT = 10;

/**
 * Parse a file and return headers + sample rows.
 * Dispatches to the appropriate parser based on file format.
 */
export async function parseFile(
  filePath: string,
  format: FileFormat
): Promise<ParseResult> {
  if (format === 'csv') {
    return parseCsv(filePath);
  }
  return parseExcel(filePath);
}

/**
 * Parse a CSV file using Papa Parse with streaming.
 * Reads only the first SAMPLE_ROW_COUNT data rows for preview,
 * but counts total rows efficiently.
 * Falls back to in-memory parsing if streaming doesn't detect headers
 * (e.g., headers-only files).
 */
async function parseCsv(filePath: string): Promise<ParseResult> {
  const result = await parseCsvStreaming(filePath);
  // Fallback: if streaming didn't capture headers (headers-only file edge case)
  if (result.headers.length === 0 && result.totalRows === 0) {
    return parseCsvInMemory(filePath);
  }
  return result;
}

async function parseCsvStreaming(filePath: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const sampleRows: Record<string, string>[] = [];
    let headers: string[] = [];
    let totalRows = 0;
    let headerParsed = false;

    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });

    Papa.parse(fileStream, {
      header: true,
      skipEmptyLines: true,
      step(results) {
        if (!headerParsed && results.meta.fields) {
          headers = results.meta.fields;
          headerParsed = true;
        }
        totalRows++;
        if (sampleRows.length < SAMPLE_ROW_COUNT) {
          sampleRows.push(results.data as Record<string, string>);
        }
      },
      complete(results) {
        // If no step was called (e.g. headers-only file), try meta from complete
        if (!headerParsed && results.meta?.fields && results.meta.fields.length > 0) {
          headers = results.meta.fields;
        }
        resolve({ headers, sampleRows, totalRows });
      },
      error(err: Error) {
        reject(new Error(`CSV parsing error: ${err.message}`));
      },
    });
  });
}

async function parseCsvInMemory(filePath: string): Promise<ParseResult> {
  const { readFile: readFileFs } = await import('node:fs/promises');
  const content = await readFileFs(filePath, 'utf-8');
  const result = Papa.parse(content, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  const allRows = result.data as Record<string, string>[];
  return {
    headers,
    sampleRows: allRows.slice(0, SAMPLE_ROW_COUNT),
    totalRows: allRows.length,
  };
}

/**
 * Parse an Excel file (.xlsx or .xls) using ExcelJS.
 * Reads the first worksheet, extracts headers from row 1,
 * and returns the first SAMPLE_ROW_COUNT rows as data.
 */
async function parseExcel(filePath: string): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();

  // Detect format from extension
  if (filePath.endsWith('.xls') && !filePath.endsWith('.xlsx')) {
    // .xls format - read as xlsx (ExcelJS handles both via file extension detection)
    await workbook.xlsx.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    return { headers: [], sampleRows: [], totalRows: 0 };
  }

  // Extract headers from the first row
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim();
  });

  // Filter out empty trailing headers
  const cleanHeaders = headers.filter((h) => h.length > 0);

  // Extract sample rows
  const sampleRows: Record<string, string>[] = [];
  const totalRows = worksheet.rowCount - 1; // Subtract header row

  for (let rowIdx = 2; rowIdx <= Math.min(worksheet.rowCount, SAMPLE_ROW_COUNT + 1); rowIdx++) {
    const row = worksheet.getRow(rowIdx);
    const rowData: Record<string, string> = {};
    cleanHeaders.forEach((header, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      rowData[header] = cell.value != null ? String(cell.value) : '';
    });
    sampleRows.push(rowData);
  }

  return { headers: cleanHeaders, sampleRows, totalRows };
}

/**
 * Get file size in bytes for performance checks.
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}
