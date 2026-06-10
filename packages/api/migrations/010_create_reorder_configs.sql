-- Migration 010: Create reorder_configs table

CREATE TABLE reorder_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days > 0),
  service_level NUMERIC(4, 3) NOT NULL DEFAULT 0.950 CHECK (service_level > 0 AND service_level < 1),
  review_period_days INTEGER NOT NULL DEFAULT 7 CHECK (review_period_days > 0),
  reorder_point NUMERIC(12, 2) NOT NULL DEFAULT 0,
  safety_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
  suggested_order_qty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_reorder_configs_product UNIQUE (product_id)
);

CREATE INDEX idx_reorder_configs_store_id ON reorder_configs(store_id);
CREATE INDEX idx_reorder_configs_product_id ON reorder_configs(product_id);
