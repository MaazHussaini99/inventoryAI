import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PluginRegistry } from './registry.js';
/**
 * Feature: grocery-inventory-intelligence
 *
 * Property-based tests for the Plugin Registry covering:
 * - Property 23: Plugin Contract Validation
 * - Property 24: Plugin Per-Store Isolation
 * - Property 26: Plugin Fault Isolation
 */
// ─── Helpers ───────────────────────────────────────────────────────────────────
function createValidPlugin(overrides = {}) {
    return {
        id: overrides.id ?? 'test-plugin',
        name: overrides.name ?? 'Test Plugin',
        version: overrides.version ?? '1.0.0',
        dependencies: overrides.dependencies ?? [],
        initialize: overrides.initialize ?? (async (_config) => { }),
        execute: overrides.execute ??
            (async (_context) => ({
                success: true,
            })),
        shutdown: overrides.shutdown ?? (async () => { }),
        healthCheck: overrides.healthCheck ??
            (async () => ({ healthy: true, errorCount: 0 })),
    };
}
// ─── Arbitraries ───────────────────────────────────────────────────────────────
/** Generates a non-empty trimmed string */
const nonEmptyStringArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0);
/** Generates a valid plugin-like object that should pass validation */
const validPluginObjectArb = fc.record({
    id: nonEmptyStringArb,
    name: nonEmptyStringArb,
    version: nonEmptyStringArb,
    dependencies: fc.array(fc.string(), { maxLength: 3 }),
    initialize: fc.constant(async () => { }),
    execute: fc.constant(async () => ({ success: true })),
    shutdown: fc.constant(async () => { }),
    healthCheck: fc.constant(async () => ({ healthy: true, errorCount: 0 })),
});
/** Generates an arbitrary object that may or may not conform to the plugin contract */
const arbitraryObjectArb = fc.oneof(
// Valid plugin
validPluginObjectArb, 
// Missing some methods
fc.record({
    id: fc.oneof(nonEmptyStringArb, fc.constant(''), fc.constant(123)),
    name: fc.oneof(nonEmptyStringArb, fc.constant(''), fc.constant(null)),
    version: fc.oneof(nonEmptyStringArb, fc.constant(''), fc.constant(undefined)),
    dependencies: fc.oneof(fc.array(fc.string(), { maxLength: 3 }), fc.constant('not-array')),
    initialize: fc.oneof(fc.constant(async () => { }), fc.constant('not-a-function'), fc.constant(undefined)),
    execute: fc.oneof(fc.constant(async () => ({ success: true })), fc.constant(null), fc.constant(undefined)),
    shutdown: fc.oneof(fc.constant(async () => { }), fc.constant(42), fc.constant(undefined)),
    healthCheck: fc.oneof(fc.constant(async () => ({ healthy: true, errorCount: 0 })), fc.constant(undefined)),
}), 
// Totally non-conforming values
fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(42), fc.constant('a string'), fc.constant([])));
/** Generates a UUID-like store ID */
const storeIdArb = fc.uuid();
// ─── Property 23: Plugin Contract Validation ───────────────────────────────────
/**
 * Property 23: Plugin Contract Validation
 *
 * For any object submitted for plugin registration, the registry should accept
 * it if and only if it implements all required interface methods (initialize,
 * execute, shutdown, healthCheck) and has valid id, name, and version fields.
 *
 * **Validates: Requirements 9.3**
 */
describe('Property 23: Plugin Contract Validation', () => {
    let registry;
    beforeEach(() => {
        registry = new PluginRegistry();
    });
    it('accepts objects that implement all required methods and have valid metadata', () => {
        fc.assert(fc.property(validPluginObjectArb, (pluginObj) => {
            const result = registry.validateContract(pluginObj);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        }), { numRuns: 100 });
    });
    it('accepts if and only if all required fields and methods are present and valid', () => {
        fc.assert(fc.property(arbitraryObjectArb, (candidate) => {
            const result = registry.validateContract(candidate);
            // Determine expected validity manually
            if (!candidate || typeof candidate !== 'object') {
                expect(result.valid).toBe(false);
                return;
            }
            const obj = candidate;
            const hasValidId = typeof obj.id === 'string' && obj.id.trim() !== '';
            const hasValidName = typeof obj.name === 'string' && obj.name.trim() !== '';
            const hasValidVersion = typeof obj.version === 'string' && obj.version.trim() !== '';
            const hasDepsArray = Array.isArray(obj.dependencies);
            const hasInitialize = typeof obj.initialize === 'function';
            const hasExecute = typeof obj.execute === 'function';
            const hasShutdown = typeof obj.shutdown === 'function';
            const hasHealthCheck = typeof obj.healthCheck === 'function';
            const shouldBeValid = hasValidId &&
                hasValidName &&
                hasValidVersion &&
                hasDepsArray &&
                hasInitialize &&
                hasExecute &&
                hasShutdown &&
                hasHealthCheck;
            expect(result.valid).toBe(shouldBeValid);
        }), { numRuns: 200 });
    });
    it('rejects objects missing any single required method', () => {
        const requiredMethods = ['initialize', 'execute', 'shutdown', 'healthCheck'];
        fc.assert(fc.property(fc.constantFrom(...requiredMethods), nonEmptyStringArb, (methodToRemove, pluginId) => {
            const pluginObj = {
                id: pluginId,
                name: 'Valid Name',
                version: '1.0.0',
                dependencies: [],
                initialize: async () => { },
                execute: async () => ({ success: true }),
                shutdown: async () => { },
                healthCheck: async () => ({ healthy: true, errorCount: 0 }),
            };
            // Remove one required method
            delete pluginObj[methodToRemove];
            const result = registry.validateContract(pluginObj);
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        }), { numRuns: 100 });
    });
    it('rejects objects with invalid metadata fields', () => {
        const invalidValues = [
            '', // empty string
            '   ', // whitespace-only
        ];
        fc.assert(fc.property(fc.constantFrom('id', 'name', 'version'), fc.constantFrom(...invalidValues), (field, invalidValue) => {
            const pluginObj = {
                id: 'valid-id',
                name: 'Valid Name',
                version: '1.0.0',
                dependencies: [],
                initialize: async () => { },
                execute: async () => ({ success: true }),
                shutdown: async () => { },
                healthCheck: async () => ({ healthy: true, errorCount: 0 }),
            };
            pluginObj[field] = invalidValue;
            const result = registry.validateContract(pluginObj);
            expect(result.valid).toBe(false);
        }), { numRuns: 100 });
    });
});
// ─── Property 24: Plugin Per-Store Isolation ───────────────────────────────────
/**
 * Property 24: Plugin Per-Store Isolation
 *
 * For any two stores and any plugin, activating or deactivating the plugin
 * for one store should not change the plugin's activation status for the other store.
 *
 * **Validates: Requirements 9.4**
 */
describe('Property 24: Plugin Per-Store Isolation', () => {
    let registry;
    beforeEach(() => {
        registry = new PluginRegistry();
    });
    it('activating a plugin for one store does not activate it for another store', async () => {
        await fc.assert(fc.asyncProperty(storeIdArb, storeIdArb, nonEmptyStringArb, async (storeIdA, storeIdB, pluginId) => {
            fc.pre(storeIdA !== storeIdB);
            const registry = new PluginRegistry();
            const plugin = createValidPlugin({ id: pluginId });
            await registry.register(plugin);
            await registry.activate(pluginId, storeIdA);
            expect(registry.isActive(pluginId, storeIdA)).toBe(true);
            expect(registry.isActive(pluginId, storeIdB)).toBe(false);
        }), { numRuns: 100 });
    });
    it('deactivating a plugin for one store does not affect another store', async () => {
        await fc.assert(fc.asyncProperty(storeIdArb, storeIdArb, nonEmptyStringArb, async (storeIdA, storeIdB, pluginId) => {
            fc.pre(storeIdA !== storeIdB);
            const registry = new PluginRegistry();
            const plugin = createValidPlugin({ id: pluginId });
            await registry.register(plugin);
            // Activate for both stores
            await registry.activate(pluginId, storeIdA);
            await registry.activate(pluginId, storeIdB);
            // Deactivate for store A
            await registry.deactivate(pluginId, storeIdA);
            // Store A should be deactivated, Store B should still be active
            expect(registry.isActive(pluginId, storeIdA)).toBe(false);
            expect(registry.isActive(pluginId, storeIdB)).toBe(true);
        }), { numRuns: 100 });
    });
    it('activation status is independent across arbitrary pairs of stores', async () => {
        await fc.assert(fc.asyncProperty(fc.array(storeIdArb, { minLength: 2, maxLength: 5 }), nonEmptyStringArb, async (storeIds, pluginId) => {
            // Ensure unique store IDs
            const uniqueStores = [...new Set(storeIds)];
            fc.pre(uniqueStores.length >= 2);
            const registry = new PluginRegistry();
            const plugin = createValidPlugin({ id: pluginId });
            await registry.register(plugin);
            // Activate only for the first store
            await registry.activate(pluginId, uniqueStores[0]);
            // First store should be active, all others should not
            expect(registry.isActive(pluginId, uniqueStores[0])).toBe(true);
            for (let i = 1; i < uniqueStores.length; i++) {
                expect(registry.isActive(pluginId, uniqueStores[i])).toBe(false);
            }
        }), { numRuns: 100 });
    });
});
// ─── Property 26: Plugin Fault Isolation ───────────────────────────────────────
/**
 * Property 26: Plugin Fault Isolation
 *
 * For any plugin that throws an error during execution, the core system should
 * remain healthy, and all other active plugins should continue functioning
 * without degradation.
 *
 * **Validates: Requirements 9.6**
 */
describe('Property 26: Plugin Fault Isolation', () => {
    it('a failing plugin does not affect execution of other plugins', async () => {
        await fc.assert(fc.asyncProperty(storeIdArb, fc.string({ minLength: 1, maxLength: 100 }), async (storeId, errorMessage) => {
            const registry = new PluginRegistry();
            // Register a plugin that always throws
            const failingPlugin = createValidPlugin({
                id: 'failing-plugin',
                name: 'Failing Plugin',
                execute: async () => {
                    throw new Error(errorMessage);
                },
            });
            // Register a plugin that always succeeds
            const healthyPlugin = createValidPlugin({
                id: 'healthy-plugin',
                name: 'Healthy Plugin',
                execute: async () => ({
                    success: true,
                    data: { result: 'ok' },
                }),
            });
            await registry.register(failingPlugin);
            await registry.register(healthyPlugin);
            await registry.activate('failing-plugin', storeId);
            await registry.activate('healthy-plugin', storeId);
            const context = {
                storeId,
                triggeredBy: 'test',
                correlationId: 'corr-1',
            };
            // Execute the failing plugin — should not throw
            const failResult = await registry.execute('failing-plugin', context);
            expect(failResult.success).toBe(false);
            // The healthy plugin should still execute successfully
            const healthyResult = await registry.execute('healthy-plugin', context);
            expect(healthyResult.success).toBe(true);
            expect(healthyResult.data).toEqual({ result: 'ok' });
        }), { numRuns: 100 });
    });
    it('multiple failing plugins do not affect a healthy plugin', async () => {
        await fc.assert(fc.asyncProperty(storeIdArb, fc.integer({ min: 1, max: 5 }), async (storeId, numFailingPlugins) => {
            const registry = new PluginRegistry();
            // Register multiple failing plugins
            for (let i = 0; i < numFailingPlugins; i++) {
                const failingPlugin = createValidPlugin({
                    id: `failing-${i}`,
                    name: `Failing Plugin ${i}`,
                    execute: async () => {
                        throw new Error(`Failure ${i}`);
                    },
                });
                await registry.register(failingPlugin);
                await registry.activate(`failing-${i}`, storeId);
            }
            // Register one healthy plugin
            const healthyPlugin = createValidPlugin({
                id: 'healthy-plugin',
                name: 'Healthy Plugin',
                execute: async () => ({
                    success: true,
                    data: { status: 'operational' },
                }),
            });
            await registry.register(healthyPlugin);
            await registry.activate('healthy-plugin', storeId);
            const context = {
                storeId,
                triggeredBy: 'test',
                correlationId: 'corr-1',
            };
            // Execute all failing plugins
            for (let i = 0; i < numFailingPlugins; i++) {
                const result = await registry.execute(`failing-${i}`, context);
                expect(result.success).toBe(false);
            }
            // The healthy plugin should still work fine
            const healthyResult = await registry.execute('healthy-plugin', context);
            expect(healthyResult.success).toBe(true);
            expect(healthyResult.data).toEqual({ status: 'operational' });
        }), { numRuns: 100 });
    });
    it('a plugin failure is contained and returns structured error without throwing', async () => {
        await fc.assert(fc.asyncProperty(storeIdArb, fc.string({ minLength: 1, maxLength: 200 }), async (storeId, errorMessage) => {
            const registry = new PluginRegistry();
            const failingPlugin = createValidPlugin({
                id: 'failing-plugin',
                name: 'Failing',
                execute: async () => {
                    throw new Error(errorMessage);
                },
            });
            await registry.register(failingPlugin);
            await registry.activate('failing-plugin', storeId);
            const context = {
                storeId,
                triggeredBy: 'test',
                correlationId: 'corr-1',
            };
            // Should NOT throw — error is caught and returned as a result
            const result = await registry.execute('failing-plugin', context);
            expect(result.success).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].code).toBe('PLUGIN_EXECUTION_ERROR');
            expect(result.errors[0].message).toBe(errorMessage);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=registry.property.test.js.map