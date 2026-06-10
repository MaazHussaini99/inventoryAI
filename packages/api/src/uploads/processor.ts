/**
 * Import processor module.
 *
 * Processes uploaded files after column mapping is confirmed:
 * 1. Reads the full file using parseFile()
 * 2. Applies confirmed column mapping to extract standard fields
 * 3. Validates required fields (product_name, quantity_sold)
 * 4. Creates/updates Product records and SalesRecord entries for valid rows
 * 5. Tracks skipped rows with error reasons in ImportedRow table
 * 6. Updates DataUpload record with import summary
 * 7. Emits 'data.imported' event on completion
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type pg from 'pg';
import type { ColumnMapping, FileFormat } from '@grocery-intel/shared';
import type { EventBus } from '../events/event-bus.js';

export interface ImportSummary {
  uploadId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

export interface ProcessorDependencies {
  pool: pg.Pool;
  eventBus: EventBus;
  uploadDir: string;
  /** Optional override for testing: provide all rows directly instead of reading from file */
  _allRowsOverride?: Record<string, string>[];
}

/**
 * Apply column mapping to a raw row, extracting standard fields.
 */
export function applyMapping(
  rawRow: Record<string, string>,
  mappings: ColumnMapping[]
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const mapping of mappings) {
    const value = rawRow[mapping.source_column];
    if (value !== undefined && value !== null) {
      mapped[mapping.target_field] = value;
    }
  }
  return mapped;
}

/**
 * Validate that a mapped row has required fields.
 * Returns null if valid, or an error message describing missing fields.
 */
export function validateRow(mapped: Record<string, string>): string | null {
  const missing: string[] = [];

  const productName = (mapped['product_name'] ?? '').trim();
  if (!productName) {
    missing.push('product_name');
  }

  const quantitySold = (mapped['quantity_sold'] ?? '').trim();
  if (!quantitySold) {
    missing.push('quantity_sold');
  }

  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }

  // Validate that quantity_sold is a valid positive number
  const qty = Number(quantitySold);
  if (isNaN(qty) || qty <= 0 || !Number.isFinite(qty)) {
    return `Invalid quantity_sold value: "${quantitySold}" (must be a positive number)`;
  }

  return null;
}

/**
 * Parse a sale_price value from a string, stripping currency symbols.
 * Returns 0 if not parseable.
 */
function parseSalePrice(value: string | undefined): number {
  if (!value || !value.trim()) return 0;
  // Strip currency symbols and thousand separators
  const cleaned = value.replace(/[$€£,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) || num < 0 ? 0 : num;
}

/**
 * Parse a sale_date value from a string.
 * Returns null if not parseable.
 */
function parseSaleDate(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();

  // Try native Date parse (handles ISO and many common formats)
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
  }

  return null;
}

/**
 * Process an upload file: validate rows, create products, create sales records.
 */
export async function processUpload(
  uploadId: string,
  storeId: string,
  deps: ProcessorDependencies
): Promise<ImportSummary> {
  const { pool, eventBus, uploadDir } = deps;

  // 1. Fetch the upload record
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_store_id', $1, TRUE)", [storeId]);

    const uploadResult = await client.query(
      `SELECT id, store_id, file_format, storage_path, column_mapping, status, total_rows
       FROM data_uploads WHERE id = $1 AND store_id = $2`,
      [uploadId, storeId]
    );

    if (uploadResult.rows.length === 0) {
      throw new Error(`Upload not found: ${uploadId}`);
    }

    const upload = uploadResult.rows[0];

    if (upload.status !== 'processing') {
      throw new Error(`Upload ${uploadId} is not in 'processing' state (current: ${upload.status})`);
    }

    const mappings: ColumnMapping[] =
      typeof upload.column_mapping === 'string'
        ? JSON.parse(upload.column_mapping)
        : upload.column_mapping;

    if (!mappings || mappings.length === 0) {
      throw new Error(`Upload ${uploadId} has no column mapping configured`);
    }

    // 2. Parse the full file
    const filePath = resolve(uploadDir, upload.storage_path);
    const format = upload.file_format as FileFormat;

    // Allow test override for row data
    const allRows = deps._allRowsOverride ?? await parseAllRows(filePath, format);

    let importedCount = 0;
    let skippedCount = 0;
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    // 3. Process each row
    for (let i = 0; i < allRows.length; i++) {
      const rawRow = allRows[i];
      const rowNumber = i + 1; // 1-indexed

      // Apply column mapping
      const mapped = applyMapping(rawRow, mappings);

      // Validate required fields
      const validationError = validateRow(mapped);

      if (validationError) {
        // Skip this row - record in imported_rows with error
        await client.query(
          `INSERT INTO imported_rows (id, upload_id, row_number, raw_data, status, error_message)
           VALUES ($1, $2, $3, $4, 'skipped', $5)`,
          [randomUUID(), uploadId, rowNumber, JSON.stringify(rawRow), validationError]
        );
        skippedCount++;
        continue;
      }

      // Extract fields
      const productName = mapped['product_name'].trim();
      const skuId = (mapped['sku_id'] ?? '').trim() || null;
      const quantitySold = Math.round(Number(mapped['quantity_sold']));
      const salePrice = parseSalePrice(mapped['sale_price']);
      const saleDate = parseSaleDate(mapped['sale_date']);
      const category = (mapped['category'] ?? '').trim() || null;
      const supplierName = (mapped['supplier_name'] ?? '').trim() || null;

      // Use today's date if no sale_date provided
      const effectiveSaleDate = saleDate ?? new Date().toISOString().split('T')[0];

      // Track date range
      if (effectiveSaleDate) {
        if (!earliestDate || effectiveSaleDate < earliestDate) {
          earliestDate = effectiveSaleDate;
        }
        if (!latestDate || effectiveSaleDate > latestDate) {
          latestDate = effectiveSaleDate;
        }
      }

      // 4. Create or update Product record
      const productId = await upsertProduct(client, {
        storeId,
        name: productName,
        skuIdentifier: skuId,
        category,
        supplierName,
        lastSaleDate: effectiveSaleDate,
      });

      // 5. Create SalesRecord
      await client.query(
        `INSERT INTO sales_records (id, product_id, store_id, upload_id, quantity_sold, sale_price, sale_date, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [randomUUID(), productId, storeId, uploadId, quantitySold, salePrice, effectiveSaleDate]
      );

      // 6. Record imported row
      await client.query(
        `INSERT INTO imported_rows (id, upload_id, row_number, raw_data, status, error_message)
         VALUES ($1, $2, $3, $4, 'imported', NULL)`,
        [randomUUID(), uploadId, rowNumber, JSON.stringify(rawRow)]
      );

      importedCount++;
    }

    // 7. Update DataUpload record with results
    await client.query(
      `UPDATE data_uploads
       SET imported_rows = $1, skipped_rows = $2, status = 'completed', processed_at = NOW()
       WHERE id = $3`,
      [importedCount, skippedCount, uploadId]
    );

    // 8. Emit 'data.imported' event
    await eventBus.publish({
      type: 'data.imported',
      storeId,
      pluginId: 'data-ingestion',
      payload: {
        uploadId,
        importedRows: importedCount,
        skippedRows: skippedCount,
        totalRows: allRows.length,
        dateRange: { earliest: earliestDate, latest: latestDate },
      },
      timestamp: new Date(),
      correlationId: randomUUID(),
    });

    return {
      uploadId,
      totalRows: allRows.length,
      importedRows: importedCount,
      skippedRows: skippedCount,
      dateRange: {
        earliest: earliestDate,
        latest: latestDate,
      },
    };
  } catch (err) {
    // Mark upload as failed on error
    try {
      await client.query(
        `UPDATE data_uploads SET status = 'failed' WHERE id = $1`,
        [uploadId]
      );
    } catch {
      // Ignore secondary error
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Upsert a product record. Matches by (store_id, sku_identifier) if sku provided,
 * or by (store_id, name) if no SKU. Returns the product ID.
 */
async function upsertProduct(
  client: pg.PoolClient,
  product: {
    storeId: string;
    name: string;
    skuIdentifier: string | null;
    category: string | null;
    supplierName: string | null;
    lastSaleDate: string;
  }
): Promise<string> {
  const { storeId, name, skuIdentifier, category, supplierName, lastSaleDate } = product;

  let existingResult;

  // Try to find existing product by SKU first (if provided), then by name
  if (skuIdentifier) {
    existingResult = await client.query(
      `SELECT id FROM products WHERE store_id = $1 AND sku_identifier = $2`,
      [storeId, skuIdentifier]
    );
  }

  if (!existingResult || existingResult.rows.length === 0) {
    existingResult = await client.query(
      `SELECT id FROM products WHERE store_id = $1 AND name = $2`,
      [storeId, name]
    );
  }

  if (existingResult.rows.length > 0) {
    // Update existing product
    const productId = existingResult.rows[0].id;
    await client.query(
      `UPDATE products
       SET category = COALESCE($1, category),
           supplier_name = COALESCE($2, supplier_name),
           sku_identifier = COALESCE($3, sku_identifier),
           last_sale_date = GREATEST(last_sale_date, $4::timestamptz),
           updated_at = NOW()
       WHERE id = $5`,
      [category, supplierName, skuIdentifier, lastSaleDate, productId]
    );
    return productId;
  }

  // Create new product
  const productId = randomUUID();
  await client.query(
    `INSERT INTO products (id, store_id, name, sku_identifier, category, supplier_name, is_active, estimated_stock, last_sale_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, 0, $7, NOW(), NOW())`,
    [productId, storeId, name, skuIdentifier, category, supplierName, lastSaleDate]
  );

  return productId;
}

/**
 * Parse all rows from a file (not just sample rows).
 * For CSV, uses Papa Parse in-memory. For Excel, reads all rows.
 */
async function parseAllRows(
  filePath: string,
  format: FileFormat
): Promise<Record<string, string>[]> {
  if (format === 'csv') {
    return parseAllCsvRows(filePath);
  }
  return parseAllExcelRows(filePath);
}

async function parseAllCsvRows(filePath: string): Promise<Record<string, string>[]> {
  const { readFile: readFileFs } = await import('node:fs/promises');
  const Papa = (await import('papaparse')).default;
  const content = await readFileFs(filePath, 'utf-8');
  const result = Papa.parse(content, { header: true, skipEmptyLines: true });
  return result.data as Record<string, string>[];
}

async function parseAllExcelRows(filePath: string): Promise<Record<string, string>[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    return [];
  }

  // Extract headers from row 1
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim();
  });
  const cleanHeaders = headers.filter((h) => h.length > 0);

  // Extract all data rows
  const rows: Record<string, string>[] = [];
  for (let rowIdx = 2; rowIdx <= worksheet.rowCount; rowIdx++) {
    const row = worksheet.getRow(rowIdx);
    const rowData: Record<string, string> = {};
    let hasData = false;
    cleanHeaders.forEach((header, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      const value = cell.value != null ? String(cell.value) : '';
      rowData[header] = value;
      if (value) hasData = true;
    });
    if (hasData) {
      rows.push(rowData);
    }
  }

  return rows;
}
