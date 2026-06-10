-- Migration 006: Create inventory_snapshots table

CREATE TABLE inventory_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('upload', 'manual', 'calculated')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_snapshots_store_id ON inventory_snapshots(store_id);
CREATE INDEX idx_inventory_snapshots_product_id ON inventory_snapshots(product_id);
CREATE INDEX idx_inventory_snapshots_recorded_at ON inventory_snapshots(store_id, recorded_at DESC);
