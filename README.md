# Grocery Inventory Intelligence

AI-powered inventory intelligence for independent grocery stores.

## Prerequisites

- **Node.js** >= 20 (see `.nvmrc`)
- **npm** >= 10
- **PostgreSQL** 16 (via Homebrew)
- **Redis** 7 (via Homebrew)

## Installing Local Services (macOS / Homebrew)

```bash
# Install PostgreSQL and Redis via Homebrew
brew install postgresql@16 redis

# Start services
brew services start postgresql@16
brew services start redis

# Verify services are running
brew services list | grep -E 'postgresql|redis'

# Create the development database
createdb grocery_intel
```

> **Note:** Homebrew PostgreSQL uses your macOS username for authentication by default (peer/trust auth), so no password is needed for local development.

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment file and adjust if needed
cp .env.example .env

# Start local services (PostgreSQL + Redis)
npm run services:start

# Create database and uploads directory
npm run setup

# Run tests
npm test

# Type-check all packages
npm run typecheck

# Start API server (port 3000)
npm run dev:api

# Start web frontend (port 5173, proxies /api to :3000)
npm run dev:web
```

## Project Structure

```
packages/
├── shared/    # Shared types, interfaces, and utilities
├── api/       # Fastify API server (Node.js)
└── web/       # React SPA dashboard (Vite)
uploads/       # Local file storage for uploads (gitignored)
```

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:api` | Start API server with hot-reload |
| `npm run dev:web` | Start web frontend with Vite HMR |
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | Type-check all packages |
| `npm run lint` | Lint all packages |
| `npm run lint:fix` | Lint and auto-fix |
| `npm run format` | Format all source files |
| `npm run build` | Build all packages |
| `npm run clean` | Remove build artifacts |

## Infrastructure Scripts

| Command | Description |
|---------|-------------|
| `npm run services:start` | Start PostgreSQL and Redis via Homebrew |
| `npm run services:stop` | Stop PostgreSQL and Redis |
| `npm run services:status` | Check service status |
| `npm run db:create` | Create the `grocery_intel` database |
| `npm run db:drop` | Drop the `grocery_intel` database |
| `npm run db:reset` | Drop and recreate the database |
| `npm run setup` | Initial project setup (db + uploads dir) |

## Local Services

| Service | Connection | Purpose |
|---------|-----------|---------|
| PostgreSQL | `localhost:5432/grocery_intel` | Primary database |
| Redis | `localhost:6379` | Cache & event bus |
| Filesystem | `./uploads/` | File upload storage |

## File Storage

This project uses the **local filesystem** (`./uploads/`) for file storage instead of S3/MinIO. Uploaded files are stored in store-scoped subdirectories:

```
uploads/
├── {store-id}/
│   ├── {upload-id}-original-filename.csv
│   └── ...
```

## Testing

The project uses **Vitest** as the test runner with **fast-check** for property-based tests:

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Test files are co-located with source code using the `.test.ts` / `.spec.ts` suffix.

## Tech Stack

- **Frontend:** React + TypeScript (Vite)
- **Backend:** Node.js + Fastify
- **Database:** PostgreSQL 16
- **Cache/Queue:** Redis 7
- **File Storage:** Local filesystem
- **Testing:** Vitest + fast-check (property-based)
- **Linting:** ESLint + Prettier
- **Language:** TypeScript throughout
