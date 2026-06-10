/**
 * Unit tests for the store onboarding and configuration routes.
 * Tests cover GET /api/stores/:id, PUT /api/stores/:id, and POST /api/stores/:id/complete-onboarding.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { storeRoutes } from './routes.js';
import { guardMiddleware, authMiddleware } from '../auth/middleware.js';

// Mock data
const STORE_ID = '660e8400-e29b-41d4-a716-446655440001';
const OTHER_STORE_ID = '770e8400-e29b-41d4-a716-446655440002';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockStoreRow = {
  id: STORE_ID,
  name: 'Test Grocery',
  category: 'grocery',
  location: 'Dallas, TX',
  approximate_sku_count: 500,
  primary_suppliers: ['Supplier A', 'Supplier B'],
  pos_system: 'Square',
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
};

// Helper to build a mock pg pool
function createMockPool(queryFn: (...args: unknown[]) => unknown) {
  const mockClient = {
    query: vi.fn(queryFn),
    release: vi.fn(),
  };
  return {
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn(),
    _client: mockClient,
  };
}

// Helper to build Fastify app with store routes and mocked auth/pg
async function buildApp(pool: ReturnType<typeof createMockPool>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Decorate with pg pool
  app.decorate('pg', pool as any);
  app.decorateRequest('storeId', undefined);
  app.decorateRequest('user', undefined);

  // Register store routes
  await app.register(storeRoutes);

  await app.ready();
  return app;
}

// Helper to inject an authenticated request
function authHeaders() {
  return {};
}

describe('GET /api/stores/:id', () => {
  let app: FastifyInstance;
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(async () => {
    pool = createMockPool((_query: unknown, _params: unknown) => {
      return { rows: [mockStoreRow] };
    });
    app = await buildApp(pool);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 401 when not authenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/stores/${STORE_ID}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('should return store profile for authenticated user', async () => {
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'GET',
      url: `/api/stores/${STORE_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.store).toBeDefined();
    expect(body.store.id).toBe(STORE_ID);
    expect(body.store.name).toBe('Test Grocery');
    expect(body.store.category).toBe('grocery');
    expect(body.store.approximateSkuCount).toBe(500);
    expect(body.store.primarySuppliers).toEqual(['Supplier A', 'Supplier B']);
    expect(body.store.posSystem).toBe('Square');

    await appWithAuth.close();
  });

  it('should return 403 when requesting a different store', async () => {
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'GET',
      url: `/api/stores/${OTHER_STORE_ID}`,
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe('FORBIDDEN');

    await appWithAuth.close();
  });

  it('should return 404 when store is not found in database', async () => {
    const emptyPool = createMockPool(() => ({ rows: [] }));
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', emptyPool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'GET',
      url: `/api/stores/${STORE_ID}`,
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('STORE_NOT_FOUND');

    await appWithAuth.close();
  });
});

describe('PUT /api/stores/:id', () => {
  it('should return 401 when not authenticated', async () => {
    const pool = createMockPool(() => ({ rows: [] }));
    const app = await buildApp(pool);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/stores/${STORE_ID}`,
      payload: { category: 'specialty' },
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('should update store metadata successfully', async () => {
    const updatedRow = {
      ...mockStoreRow,
      category: 'specialty',
      approximate_sku_count: 1000,
      primary_suppliers: ['New Supplier'],
      pos_system: 'Clover',
      updated_at: new Date(),
    };
    const pool = createMockPool((query: unknown) => {
      const q = query as string;
      if (q.includes('UPDATE')) {
        return { rows: [updatedRow] };
      }
      return { rows: [] };
    });

    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'PUT',
      url: `/api/stores/${STORE_ID}`,
      payload: {
        category: 'specialty',
        approximate_sku_count: 1000,
        primary_suppliers: ['New Supplier'],
        pos_system: 'Clover',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.store.category).toBe('specialty');
    expect(body.store.approximateSkuCount).toBe(1000);
    expect(body.store.primarySuppliers).toEqual(['New Supplier']);
    expect(body.store.posSystem).toBe('Clover');

    await appWithAuth.close();
  });

  it('should return 403 when updating a different store', async () => {
    const pool = createMockPool(() => ({ rows: [] }));
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'PUT',
      url: `/api/stores/${OTHER_STORE_ID}`,
      payload: { category: 'specialty' },
    });

    expect(response.statusCode).toBe(403);

    await appWithAuth.close();
  });

  it('should return 400 for invalid category', async () => {
    const pool = createMockPool(() => ({ rows: [] }));
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'PUT',
      url: `/api/stores/${STORE_ID}`,
      payload: { category: 'invalid_category' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    await appWithAuth.close();
  });

  it('should return 400 for negative approximate_sku_count', async () => {
    const pool = createMockPool(() => ({ rows: [] }));
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'PUT',
      url: `/api/stores/${STORE_ID}`,
      payload: { approximate_sku_count: -10 },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');

    await appWithAuth.close();
  });

  it('should return 400 when no fields are provided', async () => {
    const pool = createMockPool(() => ({ rows: [] }));
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'PUT',
      url: `/api/stores/${STORE_ID}`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('At least one field');

    await appWithAuth.close();
  });
});

describe('POST /api/stores/:id/complete-onboarding', () => {
  it('should return 401 when not authenticated', async () => {
    const pool = createMockPool(() => ({ rows: [] }));
    const app = await buildApp(pool);

    const response = await app.inject({
      method: 'POST',
      url: `/api/stores/${STORE_ID}/complete-onboarding`,
    });
    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('should activate default plugins on onboarding completion', async () => {
    const queries: { query: string; params: unknown[] }[] = [];
    const pool = createMockPool((query: unknown, params: unknown) => {
      queries.push({ query: query as string, params: params as unknown[] });
      const q = query as string;
      if (q.includes('SELECT id FROM stores')) {
        return { rows: [{ id: STORE_ID }] };
      }
      if (q.includes('INSERT INTO plugin_activations')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'POST',
      url: `/api/stores/${STORE_ID}/complete-onboarding`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.message).toContain('Onboarding complete');
    expect(body.activatedPlugins).toEqual([
      'data-ingestion',
      'data-normalizer',
      'sales-intelligence',
    ]);

    // Verify plugin activation queries were issued
    const pluginInserts = queries.filter((q) => q.query.includes('INSERT INTO plugin_activations'));
    expect(pluginInserts.length).toBe(3);

    await appWithAuth.close();
  });

  it('should return 403 when completing onboarding for a different store', async () => {
    const pool = createMockPool(() => ({ rows: [] }));
    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'POST',
      url: `/api/stores/${OTHER_STORE_ID}/complete-onboarding`,
    });

    expect(response.statusCode).toBe(403);

    await appWithAuth.close();
  });

  it('should return 404 when store does not exist', async () => {
    const pool = createMockPool((query: unknown) => {
      const q = query as string;
      if (q.includes('SELECT id FROM stores')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const appWithAuth = Fastify({ logger: false });
    appWithAuth.decorate('pg', pool as any);
    appWithAuth.decorateRequest('storeId', undefined);
    appWithAuth.decorateRequest('user', undefined);
    appWithAuth.addHook('onRequest', async (request) => {
      request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
      request.storeId = STORE_ID;
    });
    await appWithAuth.register(storeRoutes);
    await appWithAuth.ready();

    const response = await appWithAuth.inject({
      method: 'POST',
      url: `/api/stores/${STORE_ID}/complete-onboarding`,
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('STORE_NOT_FOUND');

    await appWithAuth.close();
  });
});
