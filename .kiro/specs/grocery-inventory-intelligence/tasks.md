# Implementation Plan: Grocery Inventory Intelligence

## Overview

This implementation plan builds the Grocery Inventory Intelligence MVP incrementally — starting with project scaffolding and core infrastructure (plugin system, event bus), then layering data ingestion, normalization, analytics, forecasting, reorder calculations, and AI recommendations on top. Each task builds on previous steps, ensuring no orphaned code. The tech stack is React + TypeScript frontend, Node.js/Fastify API, PostgreSQL, Redis, and S3.

## Tasks

- [x] 1. Project scaffolding and core infrastructure
  - [x] 1.1 Initialize monorepo structure with shared TypeScript configuration
    - Create directory structure: `packages/api`, `packages/web`, `packages/shared`
    - Set up TypeScript project references, ESLint, Prettier
    - Configure Vitest as the test runner with fast-check for property tests
    - Add Docker Compose for local PostgreSQL, Redis, and MinIO (S3-compatible)
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Implement core data models and database schema
    - Create PostgreSQL migration files for all entities (Store, StoreUser, Product, SalesRecord, InventorySnapshot, DataUpload, ImportedRow, ForecastRecord, ReorderConfig, PluginActivation, ColumnMappingConfig, DuplicateCandidate)
    - Implement TypeScript interfaces in `packages/shared` matching the design data models
    - Set up row-level security policies for multi-tenant isolation
    - Configure database connection pool with Fastify plugin
    - _Requirements: 10.3, 10.4_

  - [x]* 1.3 Write property test for tenant data isolation
    - **Property 27: Tenant Data Isolation**
    - **Validates: Requirements 10.3, 10.4**

  - [x] 1.4 Implement authentication and authorization
    - Create JWT-based auth middleware for Fastify
    - Implement registration endpoint with email verification flow
    - Implement login endpoint with bcrypt password hashing
    - Add store-scoped authorization checks to ensure users can only access their own store's data
    - _Requirements: 1.1, 1.2, 1.4, 10.3_

  - [x] 1.5 Implement plugin registry and event bus
    - Create `PluginRegistry` class implementing registration, activation, deactivation, and contract validation
    - Create `EventBus` class using Redis pub/sub for inter-plugin communication
    - Implement plugin lifecycle management (initialize, execute, shutdown, healthCheck)
    - Implement plugin fault isolation with try/catch wrappers and automatic deactivation on failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x]* 1.6 Write property tests for plugin system
    - **Property 23: Plugin Contract Validation**
    - **Validates: Requirements 9.3**

  - [x]* 1.7 Write property test for plugin per-store isolation
    - **Property 24: Plugin Per-Store Isolation**
    - **Validates: Requirements 9.4**

  - [x]* 1.8 Write property test for event bus delivery
    - **Property 25: Event Bus Delivery**
    - **Validates: Requirements 9.5**

  - [x]* 1.9 Write property test for plugin fault isolation
    - **Property 26: Plugin Fault Isolation**
    - **Validates: Requirements 9.6**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Store onboarding and configuration
  - [x] 3.1 Implement store onboarding API endpoints
    - Create POST `/api/stores` endpoint for store creation with metadata collection (category, approximate SKU count, primary suppliers, POS system)
    - Create GET `/api/stores/:id` endpoint for retrieving store profile
    - Create PUT `/api/stores/:id` endpoint for updating store configuration
    - Wire onboarding completion to activate default plugins for the store
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [x] 3.2 Implement store onboarding UI
    - Create registration form component with validation (store name, location, owner name, email, phone)
    - Create store configuration wizard (category, SKU count, suppliers, POS system)
    - Create guided tutorial overlay component for first-time dashboard view
    - Wire forms to API endpoints with loading states and error handling
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 4. Data ingestion plugin
  - [x] 4.1 Implement file upload and storage
    - Create POST `/api/uploads` endpoint accepting multipart file uploads
    - Validate file format (CSV, XLSX, XLS) and size (max 50MB)
    - Store uploaded files to S3/MinIO with store-scoped paths
    - Create DataUpload record with status tracking
    - Set file expiration to 90 days
    - _Requirements: 2.1, 10.5_

  - [x] 4.2 Implement file parsing and column mapping
    - Implement CSV parsing using Papa Parse with streaming for large files
    - Implement Excel parsing using ExcelJS for .xlsx and .xls formats
    - Create auto-suggest column mapping logic based on header name similarity to standard fields
    - Create GET `/api/uploads/:id/preview` endpoint returning headers, sample rows, and suggested mappings
    - Create POST `/api/uploads/:id/mapping` endpoint to confirm and save column mappings
    - Ensure parsing completes within 10 seconds for files under 10MB
    - _Requirements: 2.2, 2.3, 2.4_

  - [x]* 4.3 Write property test for column mapping round-trip
    - **Property 1: Column Mapping Round-Trip**
    - **Validates: Requirements 2.4**

  - [x] 4.4 Implement row validation and import processing
    - Validate each row for required fields (product_name, quantity_sold)
    - Skip invalid rows and track skip reasons in ImportedRow table
    - Create or update Product records from imported data
    - Create SalesRecord entries from valid rows
    - Generate import summary (total, imported, skipped, date range)
    - Emit `data.imported` event on completion
    - _Requirements: 2.5, 2.6, 2.7_

  - [x]* 4.5 Write property test for row validation partitioning
    - **Property 2: Row Validation Partitioning**
    - **Validates: Requirements 2.5, 2.6**

  - [x] 4.6 Implement file upload UI
    - Create drag-and-drop file upload component with progress indicator
    - Create column mapping interface with auto-suggestions and manual override
    - Create import summary display with download link for error details
    - Handle error states (unsupported format, corrupt file, oversized file)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Data normalization plugin
  - [x] 6.1 Implement date and currency standardization
    - Create date parser supporting MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, DD-Mon-YYYY formats
    - Create currency parser stripping symbols ($, €, £), handling comma-separated thousands, converting to numeric
    - Flag dates in the future or more than 5 years in the past for manual review
    - _Requirements: 3.3, 3.4, 3.5_

  - [x]* 6.2 Write property tests for date and currency normalization
    - **Property 4: Date Format Standardization Round-Trip**
    - **Validates: Requirements 3.3**
    - **Property 5: Currency Value Standardization Round-Trip**
    - **Validates: Requirements 3.4**
    - **Property 6: Date Range Validation**
    - **Validates: Requirements 3.5**

  - [x] 6.3 Implement fuzzy duplicate detection
    - Implement string similarity algorithm (Levenshtein/Jaro-Winkler) for product name comparison
    - Create duplicate detection with configurable threshold (default 85%)
    - Generate DuplicateCandidate records for suspected pairs
    - Create API endpoints: GET `/api/stores/:id/duplicates` and POST `/api/stores/:id/duplicates/:id/resolve`
    - _Requirements: 3.1, 3.2_

  - [x]* 6.4 Write property test for fuzzy duplicate detection
    - **Property 3: Fuzzy Duplicate Detection Threshold**
    - **Validates: Requirements 3.1**

  - [x] 6.5 Implement data quality scoring
    - Calculate completeness score based on filled required/optional fields
    - Calculate consistency score based on format uniformity
    - Calculate validity score based on range checks and referential integrity
    - Produce overall quality score (0-100) and emit `data.normalized` event
    - _Requirements: 3.6_

  - [x]* 6.6 Write property test for data quality score invariants
    - **Property 7: Data Quality Score Invariants**
    - **Validates: Requirements 3.6**

  - [x] 6.7 Implement normalization UI components
    - Create duplicate review interface showing pairs with similarity scores and merge/reject actions
    - Create data quality score display with sub-score breakdown
    - Create flagged-row review interface for manual date corrections
    - _Requirements: 3.1, 3.2, 3.5, 3.6_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Sales analytics and dashboard
  - [x] 8.1 Implement sales intelligence engine
    - Create materialized views / pre-computed aggregations for daily analytics (total revenue, units sold, average transaction value, unique SKUs)
    - Implement top-20 product ranking by revenue and by units sold
    - Implement dead stock identification (zero sales in past 30 days, sorted by last sale date)
    - Implement daily sales trend calculations with day-of-week patterns
    - Subscribe to `data.normalized` event to trigger analytics refresh
    - Emit `analytics.updated` event on completion
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x]* 8.2 Write property tests for sales analytics
    - **Property 8: Sales Summary Aggregation**
    - **Validates: Requirements 4.1**
    - **Property 9: Top-N Product Ranking**
    - **Validates: Requirements 4.2**
    - **Property 10: Dead Stock Identification**
    - **Validates: Requirements 4.3**

  - [x] 8.3 Implement sales analytics API endpoints
    - Create GET `/api/stores/:id/analytics/summary` with date range filter (today, 7d, 30d, custom)
    - Create GET `/api/stores/:id/analytics/top-products` with sort param (revenue, units)
    - Create GET `/api/stores/:id/analytics/dead-stock`
    - Create GET `/api/stores/:id/analytics/trends` for daily chart data
    - Create GET `/api/stores/:id/products/:id` for SKU detail view
    - Ensure all endpoints respond within 3 seconds using cached/pre-computed data
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [x] 8.4 Implement dashboard UI
    - Create sales summary cards (revenue, units, avg transaction, unique SKUs) with date range selector
    - Create top products table with toggle between revenue and units ranking
    - Create dead stock list component with last sale date column
    - Create daily sales trend chart (revenue + units overlay) with day-of-week highlighting
    - Create SKU detail modal with daily history, velocity, revenue, and estimated stock
    - Wire real-time refresh when new data is imported (within 60 seconds)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 9. Inventory status tracking
  - [x] 9.1 Implement inventory calculation engine
    - Calculate estimated current stock: initial_stock - cumulative_sales
    - Classify inventory status: In Stock (above reorder point), Low Stock (at or below reorder point), Out of Stock (zero or negative)
    - Create InventorySnapshot records on each calculation
    - Handle negative inventory by flagging data discrepancy
    - _Requirements: 5.1, 5.2, 5.5_

  - [x]* 9.2 Write property test for inventory calculation and status classification
    - **Property 11: Inventory Calculation and Status Classification**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 9.3 Implement inventory API and UI
    - Create GET `/api/stores/:id/inventory` endpoint with status filter and pagination
    - Create inventory status dashboard panel with color-coded indicators (green/yellow/red)
    - Create reorder alert badges for SKUs at or below reorder point
    - Display data discrepancy notifications for negative inventory
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. AI recommendation engine
  - [ ] 11.1 Implement recommendation generation logic
    - Implement "Restock Now" selection: identify products with critically low days-of-supply, return up to 10 sorted by urgency
    - Implement "Reduce or Remove" selection: identify products with declining sales velocity over 60 days, return up to 10
    - Implement "Promote This Week" selection: identify products with rising sales velocity, return up to 5
    - Generate confidence score (Low/Medium/High) and one-sentence explanation for each recommendation
    - Enforce minimum 14-day history requirement per SKU
    - Subscribe to `analytics.updated` event; emit `recommendations.ready` event
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 11.2 Write property tests for recommendations
    - **Property 12: Restock Recommendations Selection**
    - **Validates: Requirements 6.1**
    - **Property 13: Reduce/Remove Recommendations Selection**
    - **Validates: Requirements 6.2**
    - **Property 14: Promote Recommendations Selection**
    - **Validates: Requirements 6.3**
    - **Property 15: Recommendation Structural Invariants**
    - **Validates: Requirements 6.4, 6.5**

  - [ ] 11.3 Implement recommendations API and UI
    - Create GET `/api/stores/:id/recommendations` endpoint returning all three recommendation categories
    - Create POST `/api/stores/:id/recommendations/generate` endpoint for manual trigger
    - Create recommendations dashboard panel with three category cards
    - Display confidence badges and explanation text for each recommendation
    - Show "insufficient data" message when store has < 14 days of history
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 12. Demand forecasting engine
  - [ ] 12.1 Implement forecast generation logic
    - Implement trend decomposition with day-of-week seasonality
    - Generate 7-day and 14-day forecasts with confidence intervals (low, expected, high)
    - Handle data sufficiency: full forecasts when >= 30 days history, limited-data estimates using category averages when < 30 days
    - Calculate and store MAPE when actuals become available
    - Subscribe to `data.normalized` event; emit `forecast.generated` event
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_

  - [ ]* 12.2 Write property tests for forecast engine
    - **Property 16: Forecast Data Sufficiency Handling**
    - **Validates: Requirements 7.1, 7.5**
    - **Property 17: Forecast Confidence Interval Ordering**
    - **Validates: Requirements 7.4**
    - **Property 18: Forecast Accuracy (MAPE) Calculation**
    - **Validates: Requirements 7.6**

  - [ ] 12.3 Implement forecast API and UI
    - Create GET `/api/stores/:id/products/:id/forecast` endpoint returning predictions with confidence intervals
    - Create comparative chart component showing forecast vs. actual sales overlaid
    - Label limited-data estimates clearly in the UI
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

- [ ] 13. Reorder point calculation engine
  - [ ] 13.1 Implement reorder calculations
    - Calculate reorder point: (average_daily_sales × lead_time_days) + safety_stock
    - Calculate safety stock: z_score(service_level) × demand_std_dev × √(lead_time_days)
    - Calculate suggested order quantity: average_daily_sales × (lead_time + review_period) - current_stock + safety_stock
    - Apply default lead times: 3 days local, 7 days non-local when not explicitly configured
    - Calculate estimated days until stockout for urgency sorting
    - Subscribe to `forecast.generated` event; emit `reorder.calculated` event
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 13.2 Write property tests for reorder calculations
    - **Property 19: Reorder Point and Safety Stock Calculation**
    - **Validates: Requirements 8.1, 8.2**
    - **Property 20: Default Lead Time Assignment**
    - **Validates: Requirements 8.4**
    - **Property 21: Order Quantity Calculation**
    - **Validates: Requirements 8.5**
    - **Property 22: Reorder List Urgency Sorting**
    - **Validates: Requirements 8.6**

  - [ ] 13.3 Implement reorder API and UI
    - Create GET `/api/stores/:id/reorder` endpoint returning prioritized reorder list sorted by urgency
    - Create PUT `/api/stores/:id/products/:id/reorder-config` for configuring lead time, service level, review period
    - Create reorder dashboard panel with urgency-sorted list showing product, current stock, reorder point, suggested quantity, and estimated stockout date
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6_

- [ ] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Integration wiring and final polish
  - [ ] 15.1 Wire end-to-end data pipeline
    - Ensure the full flow works: upload → parse → map → import → normalize → analytics refresh → forecast recalculation → reorder recalculation → recommendations generation
    - Verify event bus correctly chains all plugin executions
    - Ensure dashboard reflects updates within 60 seconds of import completion
    - _Requirements: 4.6, 9.5_

  - [ ] 15.2 Implement error handling and graceful degradation
    - Add global error response formatting matching the ErrorResponse interface
    - Implement retry logic with exponential backoff for external service calls (S3, Redis)
    - Implement graceful degradation: show last-known-good data when analytics are delayed, display "temporarily unavailable" for failed subsystems
    - Add request ID tracking for debugging
    - _Requirements: 2.7, 4.7_

  - [ ] 15.3 Implement data security controls
    - Configure AES-256 encryption at rest for PostgreSQL and S3
    - Enforce TLS 1.2+ for all API communication
    - Add automated cleanup job for expired upload files (90-day retention)
    - Implement account deletion endpoint with 30-day data purge
    - _Requirements: 10.1, 10.2, 10.5, 10.6_

  - [ ]* 15.4 Write integration tests for end-to-end flows
    - Test complete upload → analytics pipeline
    - Test authentication and authorization across all endpoints
    - Test event bus delivery between real plugin instances
    - Test dashboard performance SLA (< 3 seconds render)
    - _Requirements: 2.1-2.7, 4.6, 4.7, 9.5, 10.3_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate the 27 universal correctness properties defined in the design using fast-check
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript throughout (frontend and backend)
- All plugins communicate through the event bus — no direct coupling between subsystems
