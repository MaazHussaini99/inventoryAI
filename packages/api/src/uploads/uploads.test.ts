/**
 * Unit tests for the file upload routes.
 * Tests cover POST /api/uploads: format validation, size validation,
 * filesystem storage, and DataUpload record creation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { uploadRoutes } from './routes.js';
import FormData from 'form-data';

// Mock data
const STORE_ID = '660e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const UPLOAD_ID = 'aaaa0000-bbbb-cccc-dddd-eeeeeeee0001';

// Mock fs/promises and crypto
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => UPLOAD_ID,
}));

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

// Helper to build Fastify app with upload routes, multipart, and mocked auth/pg
async function buildAuthenticatedApp(
  pool: ReturnType<typeof createMockPool>
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Register multipart
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // Decorate with pg pool
  app.decorate('pg', pool as any);
  app.decorateRequest('storeId', undefined);
  app.decorateRequest('user', undefined);

  // Simulate authenticated user
  app.addHook('onRequest', async (request) => {
    request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
    request.storeId = STORE_ID;
  });

  // Register upload routes
  await app.register(uploadRoutes);

  await app.ready();
  return app;
}

// Helper to build unauthenticated app
async function buildUnauthenticatedApp(
  pool: ReturnType<typeof createMockPool>
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.decorate('pg', pool as any);
  app.decorateRequest('storeId', undefined);
  app.decorateRequest('user', undefined);

  await app.register(uploadRoutes);
  await app.ready();
  return app;
}

// Helper to create a multipart form payload with a file
function createFilePayload(filename: string, content: Buffer | string) {
  const form = new FormData();
  form.append('file', Buffer.isBuffer(content) ? content : Buffer.from(content), {
    filename,
    contentType: 'application/octet-stream',
  });
  return form;
}

describe('POST /api/uploads', () => {
  let app: FastifyInstance;
  let pool: ReturnType<typeof createMockPool>;

  beforeEach(async () => {
    process.env.UPLOAD_DIR = './uploads';
    process.env.UPLOAD_MAX_SIZE_MB = '50';
    process.env.UPLOAD_RETENTION_DAYS = '90';

    pool = createMockPool((_query: unknown, _params: unknown) => {
      return {
        rows: [{
          id: UPLOAD_ID,
          status: 'pending',
          created_at: new Date('2024-06-01T00:00:00Z'),
          expires_at: new Date('2024-08-30T00:00:00Z'),
        }],
      };
    });
    app = await buildAuthenticatedApp(pool);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    const unauthApp = await buildUnauthenticatedApp(pool);
    const form = createFilePayload('sales.csv', 'col1,col2\nval1,val2');

    const response = await unauthApp.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(401);
    await unauthApp.close();
  });

  it('should successfully upload a CSV file', async () => {
    const form = createFilePayload('sales_data.csv', 'product,qty\nApples,10\nBananas,20');

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.upload).toBeDefined();
    expect(body.upload.id).toBe(UPLOAD_ID);
    expect(body.upload.fileName).toBe('sales_data.csv');
    expect(body.upload.fileFormat).toBe('csv');
    expect(body.upload.status).toBe('pending');
  });

  it('should successfully upload an XLSX file', async () => {
    const form = createFilePayload('inventory.xlsx', Buffer.from('fake xlsx content'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.upload.fileName).toBe('inventory.xlsx');
    expect(body.upload.fileFormat).toBe('xlsx');
  });

  it('should successfully upload an XLS file', async () => {
    const form = createFilePayload('data.xls', Buffer.from('fake xls content'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.upload.fileName).toBe('data.xls');
    expect(body.upload.fileFormat).toBe('xls');
  });

  it('should reject unsupported file formats', async () => {
    const form = createFilePayload('document.pdf', 'fake pdf content');

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('INVALID_FORMAT');
    expect(body.error.message).toContain('.pdf');
    expect(body.error.message).toContain('.csv');
  });

  it('should reject files exceeding max size', async () => {
    // Set a very small max size for testing
    process.env.UPLOAD_MAX_SIZE_MB = '0';

    // Rebuild the app with the new env
    await app.close();
    app = await buildAuthenticatedApp(pool);

    const form = createFilePayload('large.csv', 'a'.repeat(1024));

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('should reject requests without a file', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: '',
      headers: { 'content-type': 'multipart/form-data; boundary=----formdata' },
    });

    // The request may be rejected by multipart parser or our handler
    expect([400, 415]).toContain(response.statusCode);
  });

  it('should store file with store-scoped path', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');

    const form = createFilePayload('test.csv', 'data');

    await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    // Verify mkdir was called with a store-scoped directory
    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining(STORE_ID),
      { recursive: true }
    );

    // Verify writeFile was called with the correct path containing uploadId
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(`${UPLOAD_ID}-test.csv`),
      expect.any(Buffer)
    );
  });

  it('should create DataUpload record with correct parameters', async () => {
    const form = createFilePayload('mydata.csv', 'col1\nval1');

    await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    // Verify DB query was called with expected parameters
    const queryCall = pool._client.query.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('INSERT INTO data_uploads')
    );

    expect(queryCall).toBeDefined();
    const params = queryCall![1] as unknown[];
    expect(params[0]).toBe(UPLOAD_ID); // id
    expect(params[1]).toBe(STORE_ID); // store_id
    expect(params[2]).toBe(USER_ID); // uploaded_by
    expect(params[3]).toBe('mydata.csv'); // file_name
    expect(params[4]).toBe('csv'); // file_format
    expect(typeof params[5]).toBe('number'); // file_size_bytes
    expect(params[6]).toContain(STORE_ID); // storage_path contains store id
    expect(params[6]).toContain(UPLOAD_ID); // storage_path contains upload id
  });

  it('should set expiration to 90 days from now', async () => {
    const form = createFilePayload('data.csv', 'content');

    await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    const queryCall = pool._client.query.mock.calls.find(
      (call: unknown[]) => (call[0] as string).includes('INSERT INTO data_uploads')
    );

    expect(queryCall).toBeDefined();
    const params = queryCall![1] as unknown[];
    const expiresAt = params[7] as Date;
    const now = new Date();
    const diffDays = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    // Should be approximately 90 days (allow for test execution time)
    expect(diffDays).toBeGreaterThanOrEqual(89);
    expect(diffDays).toBeLessThanOrEqual(91);
  });

  it('should handle database errors gracefully', async () => {
    // Mock a pool where the INSERT query throws (set_config succeeds)
    let callCount = 0;
    const errorPool = createMockPool(() => {
      callCount++;
      // First call is set_config in getStoreClient, let it succeed
      if (callCount === 1) {
        return { rows: [] };
      }
      // Second call is the INSERT, throw an error
      throw new Error('Database connection failed');
    });
    await app.close();
    app = await buildAuthenticatedApp(errorPool);

    const form = createFilePayload('data.csv', 'content');

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.error.code).toBe('UPLOAD_FAILED');
    expect(body.error.retryable).toBe(true);
  });

  it('should handle case-insensitive file extensions', async () => {
    const form = createFilePayload('DATA.CSV', 'content');

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.upload.fileFormat).toBe('csv');
  });

  it('should return fileSizeBytes in the response', async () => {
    const content = 'product,qty\nApples,10';
    const form = createFilePayload('data.csv', content);

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: form,
      headers: form.getHeaders(),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.upload.fileSizeBytes).toBeGreaterThan(0);
  });
});
