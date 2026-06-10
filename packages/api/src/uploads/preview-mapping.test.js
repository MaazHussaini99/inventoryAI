/**
 * Unit tests for the preview and mapping endpoints:
 * - GET /api/uploads/:id/preview
 * - POST /api/uploads/:id/mapping
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { uploadRoutes } from './routes.js';
const STORE_ID = '660e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const UPLOAD_ID = 'aaaa0000-bbbb-cccc-dddd-eeeeeeee0001';
const MAPPING_CONFIG_ID = 'bbbb0000-cccc-dddd-eeee-ffffffffffff';
// Mock the parser module
vi.mock('./parser.js', () => ({
    parseFile: vi.fn().mockResolvedValue({
        headers: ['Product', 'Quantity', 'Price', 'Date'],
        sampleRows: [
            { Product: 'Apples', Quantity: '10', Price: '2.50', Date: '2024-01-15' },
            { Product: 'Bananas', Quantity: '20', Price: '1.25', Date: '2024-01-16' },
        ],
        totalRows: 100,
    }),
}));
// Mock crypto for consistent UUIDs in mapping config
vi.mock('node:crypto', () => ({
    randomUUID: () => MAPPING_CONFIG_ID,
}));
// Helper to build a mock pg pool with configurable query responses
function createMockPool(queryFn) {
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
// Build an authenticated Fastify app with upload routes
async function buildApp(pool) {
    const app = Fastify({ logger: false });
    await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
    app.decorate('pg', pool);
    app.decorateRequest('storeId', undefined);
    app.decorateRequest('user', undefined);
    // Simulate authenticated user
    app.addHook('onRequest', async (request) => {
        request.user = { userId: USER_ID, storeId: STORE_ID, email: 'test@test.com', role: 'owner' };
        request.storeId = STORE_ID;
    });
    await app.register(uploadRoutes);
    await app.ready();
    return app;
}
describe('GET /api/uploads/:id/preview', () => {
    let app;
    let pool;
    beforeEach(async () => {
        pool = createMockPool((query, _params) => {
            if (query.includes('SELECT') && query.includes('data_uploads')) {
                return {
                    rows: [{
                            id: UPLOAD_ID,
                            store_id: STORE_ID,
                            file_name: 'sales.csv',
                            file_format: 'csv',
                            storage_path: `${STORE_ID}/${UPLOAD_ID}-sales.csv`,
                            status: 'pending',
                        }],
                };
            }
            if (query.includes('UPDATE')) {
                return { rows: [] };
            }
            // set_config for tenant isolation
            return { rows: [] };
        });
        app = await buildApp(pool);
    });
    afterEach(async () => {
        await app.close();
    });
    it('should return headers, sample rows, and suggested mappings', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/uploads/${UPLOAD_ID}/preview`,
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.uploadId).toBe(UPLOAD_ID);
        expect(body.fileName).toBe('sales.csv');
        expect(body.headers).toEqual(['Product', 'Quantity', 'Price', 'Date']);
        expect(body.sampleRows).toHaveLength(2);
        expect(body.totalRows).toBe(100);
        expect(body.suggestedMappings).toBeInstanceOf(Array);
        expect(body.suggestedMappings.length).toBeGreaterThan(0);
    });
    it('should suggest correct mappings for common headers', async () => {
        const response = await app.inject({
            method: 'GET',
            url: `/api/uploads/${UPLOAD_ID}/preview`,
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.suggestedMappings).toBeInstanceOf(Array);
        const targetFields = body.suggestedMappings.map((m) => m.target_field);
        // "Product" should map to product_name, "Quantity" to quantity_sold, etc.
        expect(targetFields).toContain('product_name');
        expect(targetFields).toContain('quantity_sold');
    });
    it('should return 404 for non-existent upload', async () => {
        const notFoundPool = createMockPool((query) => {
            if (query.includes('SELECT') && query.includes('data_uploads')) {
                return { rows: [] };
            }
            return { rows: [] };
        });
        await app.close();
        app = await buildApp(notFoundPool);
        const response = await app.inject({
            method: 'GET',
            url: `/api/uploads/nonexistent-id/preview`,
        });
        expect(response.statusCode).toBe(404);
        const body = response.json();
        expect(body.error.code).toBe('NOT_FOUND');
    });
    it('should update status to parsing then mapping', async () => {
        await app.inject({
            method: 'GET',
            url: `/api/uploads/${UPLOAD_ID}/preview`,
        });
        const updateCalls = pool._client.query.mock.calls.filter((call) => call[0].includes('UPDATE'));
        // Should have two updates: one to 'parsing', one to 'mapping'
        expect(updateCalls.length).toBe(2);
        expect(updateCalls[0][0]).toContain("'parsing'");
        expect(updateCalls[1][0]).toContain("'mapping'");
    });
});
describe('POST /api/uploads/:id/mapping', () => {
    let app;
    let pool;
    beforeEach(async () => {
        pool = createMockPool((query, _params) => {
            if (query.includes('SELECT') && query.includes('data_uploads')) {
                return {
                    rows: [{
                            id: UPLOAD_ID,
                            store_id: STORE_ID,
                            file_name: 'sales.csv',
                            status: 'mapping',
                        }],
                };
            }
            if (query.includes('UPDATE') || query.includes('INSERT INTO column_mapping_configs')) {
                return { rows: [] };
            }
            return { rows: [] };
        });
        app = await buildApp(pool);
    });
    afterEach(async () => {
        await app.close();
    });
    it('should save column mapping and return success', async () => {
        const mappings = [
            { source_column: 'Product', target_field: 'product_name', confidence: 0.85 },
            { source_column: 'Quantity', target_field: 'quantity_sold', confidence: 0.85 },
        ];
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/${UPLOAD_ID}/mapping`,
            payload: { mappings },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.uploadId).toBe(UPLOAD_ID);
        expect(body.status).toBe('processing');
        expect(body.mappings).toEqual(mappings);
    });
    it('should update DataUpload record with mapping and status', async () => {
        const mappings = [
            { source_column: 'Product', target_field: 'product_name', confidence: 1.0 },
        ];
        await app.inject({
            method: 'POST',
            url: `/api/uploads/${UPLOAD_ID}/mapping`,
            payload: { mappings },
        });
        const updateCall = pool._client.query.mock.calls.find((call) => call[0].includes('UPDATE data_uploads SET column_mapping'));
        expect(updateCall).toBeDefined();
        expect(updateCall[1][0]).toBe(JSON.stringify(mappings));
        expect(updateCall[0]).toContain("'processing'");
    });
    it('should save ColumnMappingConfig for reuse', async () => {
        const mappings = [
            { source_column: 'Product', target_field: 'product_name', confidence: 1.0 },
        ];
        await app.inject({
            method: 'POST',
            url: `/api/uploads/${UPLOAD_ID}/mapping`,
            payload: { mappings },
        });
        const insertCall = pool._client.query.mock.calls.find((call) => call[0].includes('INSERT INTO column_mapping_configs'));
        expect(insertCall).toBeDefined();
        const params = insertCall[1];
        expect(params[1]).toBe(STORE_ID); // store_id
        expect(params[2]).toBe('sales.csv'); // source_identifier
        expect(params[3]).toBe(JSON.stringify(mappings)); // mapping
    });
    it('should return 400 for empty mappings', async () => {
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/${UPLOAD_ID}/mapping`,
            payload: { mappings: [] },
        });
        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error.code).toBe('INVALID_MAPPING');
    });
    it('should return 400 for missing mappings field', async () => {
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/${UPLOAD_ID}/mapping`,
            payload: {},
        });
        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error.code).toBe('INVALID_MAPPING');
    });
    it('should return 404 for non-existent upload', async () => {
        const notFoundPool = createMockPool((query) => {
            if (query.includes('SELECT') && query.includes('data_uploads')) {
                return { rows: [] };
            }
            return { rows: [] };
        });
        await app.close();
        app = await buildApp(notFoundPool);
        const response = await app.inject({
            method: 'POST',
            url: `/api/uploads/nonexistent-id/mapping`,
            payload: { mappings: [{ source_column: 'x', target_field: 'product_name', confidence: 1.0 }] },
        });
        expect(response.statusCode).toBe(404);
    });
});
//# sourceMappingURL=preview-mapping.test.js.map