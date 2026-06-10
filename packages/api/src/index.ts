import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { dbPlugin } from './db/index.js';
import { authMiddleware, authRoutes } from './auth/index.js';
import { eventBusPlugin } from './events/index.js';
import { storeRoutes } from './stores/index.js';
import { uploadRoutes } from './uploads/index.js';
import { duplicateRoutes } from './normalizer/duplicate-routes.js';
import { analyticsRoutes } from './analytics/routes.js';
import { registerAnalyticsSubscriber } from './analytics/subscriber.js';
import { inventoryRoutes } from './inventory/index.js';
import { recommendationsRoutes } from './recommendations/index.js';
import { registerRecommendationsSubscriber } from './recommendations/subscriber.js';
import { forecastRoutes } from './forecast/index.js';
import { registerForecastSubscriber } from './forecast/subscriber.js';
import { reorderRoutes } from './reorder/index.js';
import { registerReorderSubscriber } from './reorder/subscriber.js';
import { runCleanupJob } from './jobs/cleanup.js';

const app = Fastify({
  logger: true,
  genReqId: () => randomUUID(),
});

// ─── Global Error Handler (Task 15.2) ──────────────────────────────────────────
// Formats all unhandled errors into a consistent ErrorResponse structure.
app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    request.log.error(error, 'Unhandled server error');
  }

  reply.code(statusCode).send({
    error: {
      code: error.code ?? (isServerError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message: isServerError
        ? 'An unexpected error occurred. Please try again later.'
        : error.message,
      retryable: isServerError,
      ...(error.validation && { details: error.validation }),
    },
    requestId: request.id,
    timestamp: new Date().toISOString(),
  });
});

// ─── Not Found Handler ──────────────────────────────────────────────────────────
app.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found.`,
      retryable: false,
    },
    requestId: request.id,
    timestamp: new Date().toISOString(),
  });
});

// Register CORS
await app.register(cors, {
  origin: process.env.VITE_API_URL ?? 'http://localhost:5173',
});

// Register database connection pool
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  await app.register(dbPlugin, {
    connectionString: databaseUrl,
  });
}

// Register event bus (Redis pub/sub with in-process fallback)
const redisUrl = process.env.REDIS_URL;
await app.register(eventBusPlugin, { redisUrl });

// Register multipart support for file uploads
const maxFileSizeMB = parseInt(process.env.UPLOAD_MAX_SIZE_MB ?? '50', 10);
await app.register(multipart, {
  limits: {
    fileSize: maxFileSizeMB * 1024 * 1024,
  },
});

// Ensure uploads directory exists
const uploadDir = resolve(process.env.UPLOAD_DIR ?? './uploads');
await mkdir(uploadDir, { recursive: true });

// ─── Register Event Bus Subscribers (data pipeline wiring) ──────────────────
// Chain: upload → data.imported → [analytics, forecast] → analytics.updated → recommendations
//                                                       → forecast.generated → reorder
if (databaseUrl) {
  registerAnalyticsSubscriber({ pool: app.pg, eventBus: app.eventBus });
  registerForecastSubscriber({ pool: app.pg, eventBus: app.eventBus });
  registerRecommendationsSubscriber({ pool: app.pg, eventBus: app.eventBus });
  registerReorderSubscriber({ pool: app.pg, eventBus: app.eventBus });
}

// Register global auth middleware (decodes JWT if present, does not reject)
app.addHook('onRequest', authMiddleware);

// Register auth routes (register, login, verify-email)
await app.register(authRoutes);

// Register store routes (profile, update, onboarding)
await app.register(storeRoutes);

// Register upload routes (file upload and storage)
await app.register(uploadRoutes);

// Register duplicate detection routes
await app.register(duplicateRoutes);

// Register sales analytics routes
await app.register(analyticsRoutes);

// Register inventory routes
await app.register(inventoryRoutes);

// Register recommendations routes
await app.register(recommendationsRoutes);

// Register forecast routes
await app.register(forecastRoutes);

// Register reorder routes
await app.register(reorderRoutes);

app.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: databaseUrl ? 'configured' : 'not configured',
      uploadDir,
    },
  };
});

// ─── Cleanup Job Registration (Task 15.3) ───────────────────────────────────
// Runs on startup to delete expired upload files and purge deleted accounts.
// In production, this would be a scheduled cron job instead.

if (databaseUrl) {
  // Run cleanup asynchronously on startup (don't block server start)
  setImmediate(async () => {
    try {
      const result = await runCleanupJob({
        pool: app.pg,
        uploadDir,
        retentionDays: 90,
        purgeDelayDays: 30,
      });
      app.log.info(result, 'Cleanup job completed');
    } catch (err) {
      app.log.warn(err, 'Cleanup job failed (non-critical)');
    }
  });
}

const start = async () => {
  try {
    const port = parseInt(process.env.PORT ?? '3000', 10);
    const host = process.env.HOST ?? '0.0.0.0';
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export { app };
