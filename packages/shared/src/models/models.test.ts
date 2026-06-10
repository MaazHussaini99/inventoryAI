import { describe, it, expect } from 'vitest';
import type {
  Store,
  StoreUser,
  Product,
  SalesRecord,
  InventorySnapshot,
  DataUpload,
  ImportedRow,
  ForecastRecord,
  ReorderConfig,
  PluginActivation,
  ColumnMappingConfig,
  DuplicateCandidate,
} from './index.js';

describe('Data Models - Type Safety', () => {
  it('Store interface has correct shape', () => {
    const store: Store = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test Grocery',
      category: 'grocery',
      location: '123 Main St',
      approximate_sku_count: 500,
      primary_suppliers: ['Supplier A', 'Supplier B'],
      pos_system: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(store.id).toBeDefined();
    expect(store.category).toBe('grocery');
    expect(store.primary_suppliers).toHaveLength(2);
  });

  it('StoreUser interface has correct shape', () => {
    const user: StoreUser = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'John Owner',
      email: 'john@example.com',
      phone: '+1234567890',
      password_hash: '$2b$12$hash',
      role: 'owner',
      email_verified: false,
      created_at: new Date(),
    };
    expect(user.role).toBe('owner');
    expect(user.email_verified).toBe(false);
  });

  it('Product interface has correct shape', () => {
    const product: Product = {
      id: '123e4567-e89b-12d3-a456-426614174002',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Organic Milk',
      sku_identifier: 'SKU-001',
      category: 'Dairy',
      supplier_name: 'Farm Fresh',
      is_active: true,
      estimated_stock: 50,
      last_sale_date: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(product.is_active).toBe(true);
    expect(product.estimated_stock).toBe(50);
  });

  it('SalesRecord interface has correct shape', () => {
    const record: SalesRecord = {
      id: '123e4567-e89b-12d3-a456-426614174003',
      product_id: '123e4567-e89b-12d3-a456-426614174002',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      upload_id: '123e4567-e89b-12d3-a456-426614174004',
      quantity_sold: 3,
      sale_price: 4.99,
      sale_date: new Date('2024-01-15'),
      created_at: new Date(),
    };
    expect(record.quantity_sold).toBe(3);
    expect(record.sale_price).toBe(4.99);
  });

  it('InventorySnapshot interface has correct shape', () => {
    const snapshot: InventorySnapshot = {
      id: '123e4567-e89b-12d3-a456-426614174005',
      product_id: '123e4567-e89b-12d3-a456-426614174002',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      quantity: 100,
      source: 'upload',
      recorded_at: new Date(),
    };
    expect(snapshot.source).toBe('upload');
    expect(snapshot.quantity).toBe(100);
  });

  it('DataUpload interface has correct shape', () => {
    const upload: DataUpload = {
      id: '123e4567-e89b-12d3-a456-426614174006',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      uploaded_by: '123e4567-e89b-12d3-a456-426614174001',
      file_name: 'sales_jan.csv',
      file_format: 'csv',
      file_size_bytes: 102400,
      storage_path: '/uploads/store-1/sales_jan.csv',
      status: 'completed',
      total_rows: 500,
      imported_rows: 490,
      skipped_rows: 10,
      column_mapping: [
        { source_column: 'Name', target_field: 'product_name', confidence: 0.95 },
      ],
      processed_at: new Date(),
      created_at: new Date(),
      expires_at: new Date(),
    };
    expect(upload.status).toBe('completed');
    expect(upload.imported_rows + upload.skipped_rows).toBe(upload.total_rows);
  });

  it('ImportedRow interface has correct shape', () => {
    const row: ImportedRow = {
      id: '123e4567-e89b-12d3-a456-426614174007',
      upload_id: '123e4567-e89b-12d3-a456-426614174006',
      row_number: 1,
      raw_data: { name: 'Milk', qty: '3', price: '$4.99' },
      status: 'imported',
      error_message: null,
    };
    expect(row.status).toBe('imported');
    expect(row.error_message).toBeNull();
  });

  it('ForecastRecord interface has correct shape', () => {
    const forecast: ForecastRecord = {
      id: '123e4567-e89b-12d3-a456-426614174008',
      product_id: '123e4567-e89b-12d3-a456-426614174002',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      forecast_date: new Date('2024-02-01'),
      horizon_days: 7,
      expected_demand: 25.5,
      low_demand: 18.0,
      high_demand: 33.0,
      method: 'trend_decomposition',
      data_quality: 'full',
      mape: 12.5,
      generated_at: new Date(),
    };
    expect(forecast.low_demand).toBeLessThanOrEqual(forecast.expected_demand);
    expect(forecast.expected_demand).toBeLessThanOrEqual(forecast.high_demand);
  });

  it('ReorderConfig interface has correct shape', () => {
    const config: ReorderConfig = {
      id: '123e4567-e89b-12d3-a456-426614174009',
      product_id: '123e4567-e89b-12d3-a456-426614174002',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      lead_time_days: 3,
      service_level: 0.95,
      review_period_days: 7,
      reorder_point: 30,
      safety_stock: 10,
      suggested_order_qty: 50,
      calculated_at: new Date(),
    };
    expect(config.service_level).toBeGreaterThan(0);
    expect(config.service_level).toBeLessThan(1);
  });

  it('PluginActivation interface has correct shape', () => {
    const activation: PluginActivation = {
      id: '123e4567-e89b-12d3-a456-426614174010',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      plugin_id: 'data-ingestion',
      is_active: true,
      config: { maxFileSize: 50_000_000 },
      activated_at: new Date(),
      deactivated_at: null,
    };
    expect(activation.is_active).toBe(true);
    expect(activation.deactivated_at).toBeNull();
  });

  it('ColumnMappingConfig interface has correct shape', () => {
    const mappingConfig: ColumnMappingConfig = {
      id: '123e4567-e89b-12d3-a456-426614174011',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      source_identifier: 'pos_export_v2',
      mapping: [
        { source_column: 'Item', target_field: 'product_name', confidence: 0.9 },
        { source_column: 'Qty', target_field: 'quantity_sold', confidence: 0.85 },
      ],
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(mappingConfig.mapping).toHaveLength(2);
  });

  it('DuplicateCandidate interface has correct shape', () => {
    const candidate: DuplicateCandidate = {
      id: '123e4567-e89b-12d3-a456-426614174012',
      store_id: '123e4567-e89b-12d3-a456-426614174000',
      product_a_id: '123e4567-e89b-12d3-a456-426614174002',
      product_b_id: '123e4567-e89b-12d3-a456-426614174013',
      similarity_score: 0.92,
      status: 'pending',
      detected_at: new Date(),
      resolved_at: null,
    };
    expect(candidate.similarity_score).toBeGreaterThanOrEqual(0);
    expect(candidate.similarity_score).toBeLessThanOrEqual(1);
    expect(candidate.product_a_id).not.toBe(candidate.product_b_id);
  });
});
