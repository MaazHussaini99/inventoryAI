/**
 * Unit tests for the import processor module.
 * Tests row validation, product upserting, sales record creation,
 * skip tracking, and event emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processUpload } from './processor.js';
import type { ImportSummary, ProcessorDependencies } from './processor.js';
import type { ColumnMapping } from '@grocery-intel/shared';

// ─── Test Helpers ──────────────────────────────────────────────────────────────

interface MockQueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

function createMockClient() {
  const queryResults: MockQueryResult[] = [];
  let queryCallIndex = 0;

  const client = {
    query: vi.fn(async (): Promise<MockQueryResult> => {
      const result = queryResults[queryCallIndex] ?? { rows: [], rowCount: 0 };
      queryCallIndex++;
      return result;
    }),
    release: vi.fn(),
  };

  return {
    client,
    pushResult: (result: MockQueryResult) => queryResults.push(result),
  };
}

function createMockPool(client: ReturnType<typeof createMockClient>['client']) {
  return {
    connect: vi.fn(async () => client),
  } as unknown as ProcessorDependencies['pool'];
}

function createMockEventBus() {
  return {
    publish: vi.fn(async () => {}),
  } as unknown as ProcessorDependencies['eventBus'];
}

const DEFAULT_MAPPINGS: ColumnMapping[] = [
  { source_column: 'Product', target_field: 'product_name', confidence: 1.0 },
  { source_column: 'Qty', target_field: 'quantity_sold', confidence: 0.9 },
  { source_column: 'Price', target_field: 'sale_price', confidence: 0.85 },
  { source_column: 'Date', target_field: 'sale_date', confidence: 0.85 },
];

function makeUploadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'upload-1',
    store_id: 'store-1',
    file_format: 'csv',
    storage_path: 'store-1/file.csv',
    column_mapping: DEFAULT_MAPPINGS,
    status: 'processing',
    total_rows: 5,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('processUpload', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockPool: ProcessorDependencies['pool'];
  let mockEventBus: ProcessorDependencies['eventBus'];
  let deps: ProcessorDependencies;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockPool = createMockPool(mockClient.client);
    mockEventBus = createMockEventBus();
    deps = { pool: mockPool, eventBus: mockEventBus, uploadDir: '/tmp/uploads', _allRowsOverride: [] };
  });

  it('should throw if upload is not found', async () => {
    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [], rowCount: 0 });

    await expect(processUpload('upload-1', 'store-1', deps)).rejects.toThrow('Upload not found');
  });

  it('should throw if upload is not in processing state', async () => {
    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({
      rows: [makeUploadRow({ status: 'mapping' })],
      rowCount: 1,
    });
    // UPDATE to failed (catch block)
    mockClient.pushResult({ rows: [], rowCount: 1 });

    await expect(processUpload('upload-1', 'store-1', deps)).rejects.toThrow(
      "not in 'processing' state"
    );
  });

  it('should throw if upload has no column mapping', async () => {
    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({
      rows: [makeUploadRow({ column_mapping: null })],
      rowCount: 1,
    });
    // UPDATE to failed (catch block)
    mockClient.pushResult({ rows: [], rowCount: 1 });

    await expect(processUpload('upload-1', 'store-1', deps)).rejects.toThrow(
      'no column mapping configured'
    );
  });

  it('should skip rows with missing product_name', async () => {
    const rows = [
      { Product: '', Qty: '5', Price: '10.00', Date: '2024-01-15' },
      { Product: 'Apple', Qty: '3', Price: '2.50', Date: '2024-01-16' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // Row 1 invalid -> INSERT imported_rows (skipped)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // Row 2 valid -> SELECT product by name (not found)
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // INSERT new product
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT sales_record
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT imported_rows (imported)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.totalRows).toBe(2);
    expect(summary.skippedRows).toBe(1);
    expect(summary.importedRows).toBe(1);
  });

  it('should skip rows with missing quantity_sold', async () => {
    const rows = [
      { Product: 'Banana', Qty: '', Price: '1.50', Date: '2024-01-15' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // Row 1 invalid -> INSERT imported_rows (skipped)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.totalRows).toBe(1);
    expect(summary.skippedRows).toBe(1);
    expect(summary.importedRows).toBe(0);
  });

  it('should skip rows with invalid quantity_sold (non-positive or non-numeric)', async () => {
    const rows = [
      { Product: 'Cherry', Qty: '-5', Price: '4.00', Date: '2024-01-15' },
      { Product: 'Grape', Qty: 'abc', Price: '3.00', Date: '2024-01-16' },
      { Product: 'Fig', Qty: '0', Price: '2.00', Date: '2024-01-17' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // Row 1 invalid -> INSERT imported_rows (skipped)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // Row 2 invalid -> INSERT imported_rows (skipped)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // Row 3 invalid -> INSERT imported_rows (skipped)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.totalRows).toBe(3);
    expect(summary.skippedRows).toBe(3);
    expect(summary.importedRows).toBe(0);
  });

  it('should emit data.imported event on successful processing', async () => {
    const rows = [
      { Product: 'Milk', Qty: '10', Price: '3.99', Date: '2024-02-01' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // SELECT product by name (not found)
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // INSERT new product
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT sales_record
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT imported_rows (imported)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.importedRows).toBe(1);
    expect(summary.skippedRows).toBe(0);
    expect(mockEventBus.publish).toHaveBeenCalledTimes(1);

    const publishedEvent = vi.mocked(mockEventBus.publish).mock.calls[0][0];
    expect(publishedEvent.type).toBe('data.imported');
    expect(publishedEvent.storeId).toBe('store-1');
    expect(publishedEvent.payload).toMatchObject({
      uploadId: 'upload-1',
      importedRows: 1,
      skippedRows: 0,
      totalRows: 1,
    });
  });

  it('should generate correct date range from imported rows', async () => {
    const rows = [
      { Product: 'Apple', Qty: '5', Price: '2.00', Date: '2024-03-15' },
      { Product: 'Banana', Qty: '3', Price: '1.50', Date: '2024-03-01' },
      { Product: 'Cherry', Qty: '8', Price: '4.00', Date: '2024-03-20' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // 3 valid rows, each: SELECT product (not found), INSERT product, INSERT sales, INSERT imported_row
    for (let i = 0; i < 3; i++) {
      mockClient.pushResult({ rows: [], rowCount: 0 }); // SELECT product
      mockClient.pushResult({ rows: [], rowCount: 1 }); // INSERT product
      mockClient.pushResult({ rows: [], rowCount: 1 }); // INSERT sales_record
      mockClient.pushResult({ rows: [], rowCount: 1 }); // INSERT imported_rows
    }
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.totalRows).toBe(3);
    expect(summary.importedRows).toBe(3);
    expect(summary.skippedRows).toBe(0);
    expect(summary.dateRange.earliest).toBe('2024-03-01');
    expect(summary.dateRange.latest).toBe('2024-03-20');
  });

  it('should handle mix of valid and invalid rows correctly', async () => {
    const rows = [
      { Product: 'Apple', Qty: '5', Price: '2.00', Date: '2024-01-10' },
      { Product: '', Qty: '3', Price: '1.50', Date: '2024-01-11' },       // Missing product_name
      { Product: 'Cherry', Qty: '0', Price: '4.00', Date: '2024-01-12' }, // Invalid qty
      { Product: 'Date Fruit', Qty: '7', Price: '5.00', Date: '2024-01-13' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // Row 1 valid: SELECT product, INSERT product, INSERT sales, INSERT imported_row
    mockClient.pushResult({ rows: [], rowCount: 0 });
    mockClient.pushResult({ rows: [], rowCount: 1 });
    mockClient.pushResult({ rows: [], rowCount: 1 });
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // Row 2 invalid: INSERT imported_rows (skipped)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // Row 3 invalid: INSERT imported_rows (skipped)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // Row 4 valid: SELECT product, INSERT product, INSERT sales, INSERT imported_row
    mockClient.pushResult({ rows: [], rowCount: 0 });
    mockClient.pushResult({ rows: [], rowCount: 1 });
    mockClient.pushResult({ rows: [], rowCount: 1 });
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.totalRows).toBe(4);
    expect(summary.importedRows).toBe(2);
    expect(summary.skippedRows).toBe(2);
    expect(summary.dateRange.earliest).toBe('2024-01-10');
    expect(summary.dateRange.latest).toBe('2024-01-13');
  });

  it('should update existing product when found by name', async () => {
    const rows = [
      { Product: 'Existing Product', Qty: '2', Price: '9.99', Date: '2024-04-01' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // SELECT product by name (FOUND)
    mockClient.pushResult({ rows: [{ id: 'existing-product-id' }], rowCount: 1 });
    // UPDATE existing product
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT sales_record
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT imported_rows (imported)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.importedRows).toBe(1);

    // Verify the UPDATE products call was made
    const calls = mockClient.client.query.mock.calls;
    const updateProductCall = calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE products')
    );
    expect(updateProductCall).toBeDefined();
  });

  it('should find existing product by SKU when sku_id is provided', async () => {
    const mappingsWithSku: ColumnMapping[] = [
      ...DEFAULT_MAPPINGS,
      { source_column: 'SKU', target_field: 'sku_id', confidence: 1.0 },
    ];

    const rows = [
      { Product: 'Product X', Qty: '4', Price: '5.00', Date: '2024-05-01', SKU: 'SKU-001' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow({ column_mapping: mappingsWithSku })], rowCount: 1 });
    // SELECT product by SKU (FOUND)
    mockClient.pushResult({ rows: [{ id: 'sku-product-id' }], rowCount: 1 });
    // UPDATE existing product
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT sales_record
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT imported_rows (imported)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.importedRows).toBe(1);

    // Verify first product lookup was by SKU
    const calls = mockClient.client.query.mock.calls;
    const skuLookupCall = calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('sku_identifier')
    );
    expect(skuLookupCall).toBeDefined();
  });

  it('should update upload status to completed with correct counts', async () => {
    const rows = [
      { Product: 'Orange', Qty: '12', Price: '1.00', Date: '2024-06-01' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // SELECT product by name (not found)
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // INSERT new product
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT sales_record
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT imported_rows (imported)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    await processUpload('upload-1', 'store-1', deps);

    // Find the UPDATE data_uploads call
    const calls = mockClient.client.query.mock.calls;
    const updateUploadCall = calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        (call[0] as string).includes('UPDATE data_uploads') &&
        (call[0] as string).includes('completed')
    );
    expect(updateUploadCall).toBeDefined();
    // imported_rows = 1, skipped_rows = 0
    expect((updateUploadCall as unknown[])[1]).toEqual([1, 0, 'upload-1']);
  });

  it('should handle rows with no sale_date by using today', async () => {
    const rows = [
      { Product: 'Bread', Qty: '6', Price: '3.50', Date: '' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // SELECT product by name (not found)
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // INSERT new product
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT sales_record
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT imported_rows (imported)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.importedRows).toBe(1);
    // The date range should be today's date
    const today = new Date().toISOString().split('T')[0];
    expect(summary.dateRange.earliest).toBe(today);
    expect(summary.dateRange.latest).toBe(today);
  });

  it('should handle sale_price with currency symbols', async () => {
    const rows = [
      { Product: 'Cheese', Qty: '2', Price: '$12.99', Date: '2024-07-01' },
    ];
    deps._allRowsOverride = rows;

    // set_config
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // SELECT upload
    mockClient.pushResult({ rows: [makeUploadRow()], rowCount: 1 });
    // SELECT product by name (not found)
    mockClient.pushResult({ rows: [], rowCount: 0 });
    // INSERT new product
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT sales_record
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // INSERT imported_rows (imported)
    mockClient.pushResult({ rows: [], rowCount: 1 });
    // UPDATE data_uploads
    mockClient.pushResult({ rows: [], rowCount: 1 });

    const summary = await processUpload('upload-1', 'store-1', deps);

    expect(summary.importedRows).toBe(1);

    // Verify the sales_record insert had the correct price (12.99)
    const calls = mockClient.client.query.mock.calls;
    const salesInsertCall = calls.find(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO sales_records')
    );
    expect(salesInsertCall).toBeDefined();
    // The params array should have sale_price = 12.99 at index 5
    const params = (salesInsertCall as unknown[])[1] as unknown[];
    expect(params[4]).toBe(2); // quantity_sold (rounded)
    expect(params[5]).toBe(12.99); // sale_price
  });
});
