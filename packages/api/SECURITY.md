# Data Security Controls

This document describes the data security controls implemented and their production configuration requirements.

## Encryption at Rest (Requirement 10.1)

**Status:** Documented for production configuration.

### PostgreSQL
- Production: Enable `pgcrypto` extension and configure Transparent Data Encryption (TDE) or use AWS RDS with encryption enabled (AES-256).
- Local dev: Not enforced — relies on disk-level encryption of the development machine.

### S3 / MinIO
- Production: Enable server-side encryption with `SSE-S3` (AES-256) on the upload bucket.
  ```json
  {
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }
  ```
- Local dev (MinIO): Encryption at rest is not enforced.

## Encryption in Transit (Requirement 10.2)

**Status:** Documented for production configuration.

### API Communication
- Production: Terminate TLS 1.2+ at the load balancer (e.g., AWS ALB) or reverse proxy (nginx).
  - Enforce `min_protocol_version = "TLSv1.2"` on the ALB/listener.
  - Redirect HTTP to HTTPS.
- Local dev: HTTP is used for development convenience. The Fastify server listens on plain HTTP.

### Database Connections
- Production: Set `sslmode=require` in the PostgreSQL connection string.
- Local dev: SSL not required for local Docker PostgreSQL.

### Redis Connections
- Production: Use `rediss://` protocol (Redis over TLS) for the REDIS_URL.
- Local dev: Plain `redis://` connection to local Docker Redis.

## Automated Cleanup (Requirement 10.5)

**Status:** Implemented in `packages/api/src/jobs/cleanup.ts`.

- Raw upload files are retained for 90 days.
- After 90 days, the raw file is deleted from storage but processed analytical data (products, sales records, aggregations) is retained.
- The cleanup job runs on app startup and should be additionally configured as a scheduled task (e.g., AWS CloudWatch Events / cron) in production for reliability.

## Account Deletion (Requirement 10.6)

**Status:** Implemented via `DELETE /api/auth/account`.

- When a store owner requests account deletion, a 30-day grace period begins.
- After 30 days, the cleanup job permanently deletes all store data including:
  - Products, sales records, inventory snapshots
  - Forecast records, reorder configs
  - Upload files and import metadata
  - User accounts and store configuration
- The deletion is irreversible after the 30-day window.

## Authentication (Requirement 10.3)

- All API endpoints require JWT authentication (except `/api/auth/register`, `/api/auth/login`, `/api/auth/verify-email`, and `/health`).
- JWT tokens are signed with HMAC-SHA256.
- Token expiration is configured via `JWT_EXPIRES_IN` env var (default: 24h).

## Multi-Tenant Isolation (Requirement 10.4)

- Row-Level Security (RLS) is enforced at the PostgreSQL level.
- Each request sets `app.current_store_id` on the database session.
- RLS policies ensure queries only return data for the authenticated store.
