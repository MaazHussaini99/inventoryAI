import { describe, it, expect } from 'vitest';
import { createPool } from './pool.js';
describe('createPool', () => {
    it('creates a pool with default configuration', () => {
        const pool = createPool({
            connectionString: 'postgresql://test@localhost:5432/test_db',
        });
        expect(pool).toBeDefined();
        // Pool options are set internally; verify pool is a valid pg.Pool
        expect(pool.totalCount).toBe(0);
        expect(pool.idleCount).toBe(0);
        expect(pool.waitingCount).toBe(0);
        // Clean up without connecting
        pool.end();
    });
    it('accepts custom pool size settings', () => {
        const pool = createPool({
            connectionString: 'postgresql://test@localhost:5432/test_db',
            max: 5,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 3000,
        });
        expect(pool).toBeDefined();
        pool.end();
    });
});
//# sourceMappingURL=pool.test.js.map