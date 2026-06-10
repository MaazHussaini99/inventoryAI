-- Migration 008: Create imported_rows table

CREATE TABLE imported_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_id UUID NOT NULL REFERENCES data_uploads(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL CHECK (status IN ('imported', 'skipped', 'error')),
  error_message TEXT
);

CREATE INDEX idx_imported_rows_upload_id ON imported_rows(upload_id);
CREATE INDEX idx_imported_rows_status ON imported_rows(upload_id, status);
