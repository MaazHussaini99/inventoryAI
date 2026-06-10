-- Migration 014: Enable Row-Level Security for multi-tenant isolation
-- Uses a session variable `app.current_store_id` set by the API before executing queries.

-- Enable RLS on all tenant-scoped tables
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_mapping_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_candidates ENABLE ROW LEVEL SECURITY;

-- Store: users can only see their own store
CREATE POLICY store_isolation_policy ON stores
  USING (id = current_setting('app.current_store_id', TRUE)::UUID);

-- StoreUsers: users can only see users in their store
CREATE POLICY store_users_isolation_policy ON store_users
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- Products: scoped to store
CREATE POLICY products_isolation_policy ON products
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- SalesRecords: scoped to store
CREATE POLICY sales_records_isolation_policy ON sales_records
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- InventorySnapshots: scoped to store
CREATE POLICY inventory_snapshots_isolation_policy ON inventory_snapshots
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- DataUploads: scoped to store
CREATE POLICY data_uploads_isolation_policy ON data_uploads
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- ImportedRows: scoped via upload's store (uses a subquery)
CREATE POLICY imported_rows_isolation_policy ON imported_rows
  USING (upload_id IN (
    SELECT id FROM data_uploads
    WHERE store_id = current_setting('app.current_store_id', TRUE)::UUID
  ));

-- ForecastRecords: scoped to store
CREATE POLICY forecast_records_isolation_policy ON forecast_records
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- ReorderConfigs: scoped to store
CREATE POLICY reorder_configs_isolation_policy ON reorder_configs
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- PluginActivations: scoped to store
CREATE POLICY plugin_activations_isolation_policy ON plugin_activations
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- ColumnMappingConfigs: scoped to store
CREATE POLICY column_mapping_configs_isolation_policy ON column_mapping_configs
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);

-- DuplicateCandidates: scoped to store
CREATE POLICY duplicate_candidates_isolation_policy ON duplicate_candidates
  USING (store_id = current_setting('app.current_store_id', TRUE)::UUID);
