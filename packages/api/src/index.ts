import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { dbPlugin } from './db/index.js';
import { authMiddleware, authRoutes } from './auth/index.js';
import { eventBusPlugin } from './events/index.js';
import { storeRoutes } from './stores/index.js';
import { uploadRoutes } from './uploads/index.js';
import { duplicateRoutes } from './normalizer/duplicate-routes.js';
import { analyticsRoutes } from './analytics/routes.js';
import { inventoryRoutes } from './inventory/index.js';
import { recommendationsRoutes } from './recommendations/index.js';

const app = Fastify({
  logger: true,
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
