-- Migration 004: Create products table

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  sku_identifier VARCHAR(255),
  category VARCHAR(255),
  supplier_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  estimated_stock INTEGER NOT NULL DEFAULT 0,
  last_sale_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_products_store_sku ON products(store_id, sku_identifier);
CREATE INDEX idx_products_store_category ON products(store_id, category);
CREATE INDEX idx_products_store_active ON products(store_id, is_active);
