import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getStoreClient } from './plugin.js';

/**
 * Feature: grocery-inventory-intelligence
 * Property 27: Tenant Data Isolation
 *
 * For any store's data and any user from a different store, access attempts
 * to the first store's data should be denied, regardless of the API endpoint
 * or query parameters used.
 *
 * **Validates: Requirements 10.3, 10.4**
 *
 * Since we cannot easily test against a real DB in unit tests, this property test
 * validates the logic of the `getStoreClient` helper — specifically that it always
 * calls `set_config('app.current_store_id', storeId, TRUE)` with the correct store ID,
 * and that two different store IDs always result in different config values being set.
 */
describe('Property 27: Tenant Data Isolation', () => {
  // Arbitrary for valid UUID-like store IDs
  const storeIdArb = fc.uuid();

  it('getStoreClient always sets the correct store ID via set_config', async () => {
    await fc.assert(
      fc.asyncProperty(storeIdArb, async (storeId) => {
        const queries: { text: string; params: unknown[] }[] = [];

        // Mock pool that records queries
        const mockPool = {
          connect: async () => ({
            query: async (text: string, params?: unknown[]) => {
              queries.push({ text, params: params ?? [] });
              return { rows: [], rowCount: 0 };
            },
            release: () => {},
          }),
        };

        const client = await getStoreClient(mockPool as never, storeId);
        client.release();

        // Verify that set_config was called with the exact storeId
        expect(queries.length).toBe(1);
        expect(queries[0].text).toBe(
          "SELECT set_config('app.current_store_id', $1, TRUE)"
        );
        expect(queries[0].params).toEqual([storeId]);
      }),
      { numRuns: 100 }
    );
  });

  it('two different store IDs always result in different config values', async () => {
    await fc.assert(
      fc.asyncProperty(
        storeIdArb,
        storeIdArb,
        async (storeIdA, storeIdB) => {
          fc.pre(storeIdA !== storeIdB);

          const queriesA: { text: string; params: unknown[] }[] = [];
          const queriesB: { text: string; params: unknown[] }[] = [];

          const createMockPool = (queries: { text: string; params: unknown[] }[]) => ({
            connect: async () => ({
              query: async (text: string, params?: unknown[]) => {
                queries.push({ text, params: params ?? [] });
                return { rows: [], rowCount: 0 };
              },
              release: () => {},
            }),
          });

          const clientA = await getStoreClient(createMockPool(queriesA) as never, storeIdA);
          clientA.release();

          const clientB = await getStoreClient(createMockPool(queriesB) as never, storeIdB);
          clientB.release();

          // Both should call set_config but with different store IDs
          expect(queriesA[0].params[0]).not.toEqual(queriesB[0].params[0]);
          expect(queriesA[0].params[0]).toBe(storeIdA);
          expect(queriesB[0].params[0]).toBe(storeIdB);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getStoreClient without storeId does not call set_config', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const queries: { text: string; params: unknown[] }[] = [];

        const mockPool = {
          connect: async () => ({
            query: async (text: string, params?: unknown[]) => {
              queries.push({ text, params: params ?? [] });
              return { rows: [], rowCount: 0 };
            },
            release: () => {},
          }),
        };

        const client = await getStoreClient(mockPool as never, undefined);
        client.release();

        // No set_config should be called when storeId is undefined
        expect(queries.length).toBe(0);
      }),
      { numRuns: 10 }
    );
  });
});
