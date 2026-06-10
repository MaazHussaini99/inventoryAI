-- Migration 009: Create forecast_records table

CREATE TABLE forecast_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  forecast_date DATE NOT NULL,
  horizon_days INTEGER NOT NULL CHECK (horizon_days IN (7, 14)),
  expected_demand NUMERIC(12, 2) NOT NULL,
  low_demand NUMERIC(12, 2) NOT NULL,
  high_demand NUMERIC(12, 2) NOT NULL,
  method VARCHAR(50) NOT NULL CHECK (method IN ('trend_decomposition', 'category_average', 'simple_moving_average')),
  data_quality VARCHAR(20) NOT NULL CHECK (data_quality IN ('full', 'limited')),
  mape NUMERIC(8, 4),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_demand_ordering CHECK (low_demand <= expected_demand AND expected_demand <= high_demand)
);

CREATE INDEX idx_forecast_records_store_id ON forecast_records(store_id);
CREATE INDEX idx_forecast_records_product_id ON forecast_records(product_id);
CREATE INDEX idx_forecast_records_date ON forecast_records(store_id, forecast_date);
