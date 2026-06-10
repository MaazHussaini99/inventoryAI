-- Migration 001: Enable required extensions
-- This migration enables UUID generation and sets up the foundation for RLS.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text matching in duplicate detection
