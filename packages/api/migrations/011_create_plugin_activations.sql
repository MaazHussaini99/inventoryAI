-- Migration 011: Create plugin_activations table

CREATE TABLE plugin_activations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  plugin_id VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}',
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  CONSTRAINT uq_plugin_activations_store_plugin UNIQUE (store_id, plugin_id)
);

CREATE INDEX idx_plugin_activations_store_id ON plugin_activations(store_id);
CREATE INDEX idx_plugin_activations_active ON plugin_activations(store_id, is_active);
