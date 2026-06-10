-- Add deletion_requested_at column to stores table for account deletion scheduling
-- Requirement 10.6: Account deletion with 30-day data purge

ALTER TABLE stores ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ DEFAULT NULL;
