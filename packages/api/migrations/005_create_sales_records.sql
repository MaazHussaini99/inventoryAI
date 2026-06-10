-- Migration 005: Create sales_records table

CREATE TABLE sales_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  upload_id UUID,
  quantity_sold INTEGER NOT NULL CHECK (quantity_sold > 0),
  sale_price NUMERIC(12, 2) NOT NULL CHECK (sale_price >= 0),
  sale_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_records_store_id ON sales_records(store_id);
CREATE INDEX idx_sales_records_product_id ON sales_records(product_id);
CREATE INDEX idx_sales_records_sale_date ON sales_records(store_id, sale_date);
CREATE INDEX idx_sales_records_upload_id ON sales_records(upload_id);
