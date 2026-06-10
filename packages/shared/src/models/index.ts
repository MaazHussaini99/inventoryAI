/**
 * Core data models for Grocery Inventory Intelligence platform.
 * These interfaces mirror the PostgreSQL schema and provide type safety across the stack.
 */

// ─── Store ─────────────────────────────────────────────────────────────────────

export interface Store {
  id: string;
  name: string;
  category: 'grocery' | 'specialty' | 'general';
  location: string;
  approximate_sku_count: number;
  primary_suppliers: string[];
  pos_system: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── StoreUser ─────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'staff';

export interface StoreUser {
  id: string;
  store_id: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: UserRole;
  email_verified: boolean;
  created_at: Date;
}

// ─── Product ───────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  store_id: string;
  name: string;
  sku_identifier: string | null;
  category: string | null;
  supplier_name: string | null;
  is_active: boolean;
  estimated_stock: number;
  last_sale_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── SalesRecord ───────────────────────────────────────────────────────────────

export interface SalesRecord {
  id: string;
  product_id: string;
  store_id: string;
  upload_id: string;
  quantity_sold: number;
  sale_price: number;
  sale_date: Date;
  created_at: Date;
}

// ─── InventorySnapshot ─────────────────────────────────────────────────────────

export type InventorySource = 'upload' | 'manual' | 'calculated';

export interface InventorySnapshot {
  id: string;
  product_id: string;
  store_id: string;
  quantity: number;
  source: InventorySource;
  recorded_at: Date;
}

// ─── DataUpload ────────────────────────────────────────────────────────────────

export type FileFormat = 'csv' | 'xlsx' | 'xls';
export type UploadStatus = 'pending' | 'parsing' | 'mapping' | 'processing' | 'completed' | 'failed';

export interface DataUpload {
  id: string;
  store_id: string;
  uploaded_by: string;
  file_name: string;
  file_format: FileFormat;
  file_size_bytes: number;
  storage_path: string;
  status: UploadStatus;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  column_mapping: ColumnMapping[] | null;
  processed_at: Date | null;
  created_at: Date;
  expires_at: Date;
}

// ─── ImportedRow ───────────────────────────────────────────────────────────────

export type ImportedRowStatus = 'imported' | 'skipped' | 'error';

export interface ImportedRow {
  id: string;
  upload_id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  status: ImportedRowStatus;
  error_message: string | null;
}

// ─── ForecastRecord ────────────────────────────────────────────────────────────

export type ForecastMethod = 'trend_decomposition' | 'category_average' | 'simple_moving_average';
export type DataQuality = 'full' | 'limited';

export interface ForecastRecord {
  id: string;
  product_id: string;
  store_id: string;
  forecast_date: Date;
  horizon_days: number;
  expected_demand: number;
  low_demand: number;
  high_demand: number;
  method: ForecastMethod;
  data_quality: DataQuality;
  mape: number | null;
  generated_at: Date;
}

// ─── ReorderConfig ─────────────────────────────────────────────────────────────

export interface ReorderConfig {
  id: string;
  product_id: string;
  store_id: string;
  lead_time_days: number;
  service_level: number;
  review_period_days: number;
  reorder_point: number;
  safety_stock: number;
  suggested_order_qty: number;
  calculated_at: Date;
}

// ─── PluginActivation ──────────────────────────────────────────────────────────

export interface PluginActivation {
  id: string;
  store_id: string;
  plugin_id: string;
  is_active: boolean;
  config: Record<string, unknown>;
  activated_at: Date;
  deactivated_at: Date | null;
}

// ─── ColumnMappingConfig ───────────────────────────────────────────────────────

export type StandardField =
  | 'product_name'
  | 'sku_id'
  | 'quantity_sold'
  | 'sale_price'
  | 'sale_date'
  | 'category'
  | 'supplier_name';

export interface ColumnMapping {
  source_column: string;
  target_field: StandardField;
  confidence: number;
  transform?: string;
}

export interface ColumnMappingConfig {
  id: string;
  store_id: string;
  source_identifier: string;
  mapping: ColumnMapping[];
  created_at: Date;
  updated_at: Date;
}

// ─── DuplicateCandidate ────────────────────────────────────────────────────────

export type DuplicateStatus = 'pending' | 'merged' | 'rejected';

export interface DuplicateCandidate {
  id: string;
  store_id: string;
  product_a_id: string;
  product_b_id: string;
  similarity_score: number;
  status: DuplicateStatus;
  detected_at: Date;
  resolved_at: Date | null;
}
