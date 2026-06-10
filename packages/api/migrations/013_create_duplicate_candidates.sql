-- Migration 013: Create duplicate_candidates table

CREATE TABLE duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_a_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_b_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  similarity_score NUMERIC(5, 4) NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'rejected')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_different_products CHECK (product_a_id != product_b_id)
);

CREATE INDEX idx_duplicate_candidates_store_id ON duplicate_candidates(store_id);
CREATE INDEX idx_duplicate_candidates_status ON duplicate_candidates(store_id, status);
CREATE INDEX idx_duplicate_candidates_products ON duplicate_candidates(product_a_id, product_b_id);
