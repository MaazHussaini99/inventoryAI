-- Migration 012: Create column_mapping_configs table

CREATE TABLE column_mapping_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source_identifier VARCHAR(500) NOT NULL,
  mapping JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_column_mapping_store_source UNIQUE (store_id, source_identifier)
);

CREATE INDEX idx_column_mapping_configs_store_id ON column_mapping_configs(store_id);
