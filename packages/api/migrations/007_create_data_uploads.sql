-- Migration 007: Create data_uploads table

CREATE TABLE data_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES store_users(id) ON DELETE SET NULL,
  file_name VARCHAR(500) NOT NULL,
  file_format VARCHAR(10) NOT NULL CHECK (file_format IN ('csv', 'xlsx', 'xls')),
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
  storage_path VARCHAR(1000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'parsing', 'mapping', 'processing', 'completed', 'failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  column_mapping JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX idx_data_uploads_store_id ON data_uploads(store_id);
CREATE INDEX idx_data_uploads_status ON data_uploads(store_id, status);
CREATE INDEX idx_data_uploads_expires_at ON data_uploads(expires_at);

-- Add FK from sales_records.upload_id now that data_uploads exists
ALTER TABLE sales_records
  ADD CONSTRAINT fk_sales_records_upload_id
  FOREIGN KEY (upload_id) REFERENCES data_uploads(id) ON DELETE SET NULL;
