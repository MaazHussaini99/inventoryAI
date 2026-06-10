-- Migration 002: Create stores table

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('grocery', 'specialty', 'general')),
  location VARCHAR(500) NOT NULL DEFAULT '',
  approximate_sku_count INTEGER NOT NULL DEFAULT 0,
  primary_suppliers TEXT[] NOT NULL DEFAULT '{}',
  pos_system VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stores_category ON stores(category);
