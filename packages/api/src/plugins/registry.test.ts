import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from './registry.js';
import type { Plugin, PluginConfig, ExecutionContext, PluginResult, HealthStatus } from '@grocery-intel/shared';

function createMockPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    dependencies: [],
    initialize: async (_config: PluginConfig) => {},
    execute: async (_context: ExecutionContext): Promise<PluginResult> => ({ success: true }),
    shutdown: async () => {},
    healthCheck: async (): Promise<HealthStatus> => ({ healthy: true, errorCount: 0 }),
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('validateContract', () => {
    it('accepts a valid plugin', () => {
      const plugin = createMockPlugin();
      const result = registry.validateContract(plugin);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects null', () => {
      const result = registry.validateContract(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin must be a non-null object');
    });

    it('rejects plugin with missing id', () => {
      const plugin = createMockPlugin({ id: '' });
      const result = registry.validateContract(plugin);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin must have a non-empty string "id" field');
    });

    it('rejects plugin with missing name', () => {
      const plugin = createMockPlugin({ name: '' });
      const result = registry.validateContract(plugin);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin must have a non-empty string "name" field');
    });

    it('rejects plugin with missing version', () => {
      const plugin = createMockPlugin({ version: '' });
      const result = registry.validateContract(plugin);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin must have a non-empty string "version" field');
    });

    it('rejects plugin without dependencies array', () => {
      const plugin = createMockPlugin();
      (plugin as unknown as Record<string, unknown>).dependencies = 'not-an-array';
      const result = registry.validateContract(plugin);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin must have a "dependencies" array');
    });

    it('rejects plugin missing required methods', () => {
      const partial = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        dependencies: [],
      };
      const result = registry.validateContract(partial);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Plugin must implement "initialize" method');
      expect(result.errors).toContain('Plugin must implement "execute" method');
      expect(result.errors).toContain('Plugin must implement "shutdown" method');
      expect(result.errors).toContain('Plugin must implement "healthCheck" method');
    });
  });

  describe('register', () => {
    it('registers a valid plugin', async () => {
      const plugin = createMockPlugin();
      const result = await registry.register(plugin);
      expect(result.success).toBe(true);
      expect(result.pluginId).toBe('test-plugin');
    });

    it('rejects duplicate registration', async () => {
      const plugin = createMockPlugin();
      await registry.register(plugin);
      const result = await registry.register(plugin);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('Plugin with id "test-plugin" is already registered');
    });

    it('rejects invalid plugin', async () => {
      const plugin = createMockPlugin({ id: '' });
      const result = await registry.register(plugin);
      expect(result.success).toBe(false);
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    });
  });

  describe('unregister', () => {
    it('removes a registered plugin', async () => {
      const plugin = createMockPlugin();
      await registry.register(plugin);
      await registry.unregister('test-plugin');
      expect(registry.getRegisteredPluginIds()).not.toContain('test-plugin');
    });

    it('does nothing for unknown plugin', async () => {
      await registry.unregister('unknown');
      // No error thrown
    });
  });

  describe('activate / deactivate', () => {
    it('activates a plugin for a store', async () => {
      const plugin = createMockPlugin();
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');
      expect(registry.isActive('test-plugin', 'store-1')).toBe(true);
    });

    it('throws if plugin is not registered', async () => {
      await expect(registry.activate('unknown', 'store-1')).rejects.toThrow(
        'Plugin "unknown" is not registered'
      );
    });

    it('is idempotent when already active', async () => {
      const initCalls: string[] = [];
      const plugin = createMockPlugin({
        initialize: async () => { initCalls.push('init'); },
      });
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');
      await registry.activate('test-plugin', 'store-1');
      // initialize only called once
      expect(initCalls).toHaveLength(1);
    });

    it('throws if dependency is not active for store', async () => {
      const dep = createMockPlugin({ id: 'dep-plugin', name: 'Dep Plugin' });
      const plugin = createMockPlugin({ dependencies: ['dep-plugin'] });
      await registry.register(dep);
      await registry.register(plugin);
      await expect(registry.activate('test-plugin', 'store-1')).rejects.toThrow(
        'Dependency "dep-plugin" is not active for store "store-1"'
      );
    });

    it('activates when dependency is satisfied', async () => {
      const dep = createMockPlugin({ id: 'dep-plugin', name: 'Dep Plugin' });
      const plugin = createMockPlugin({ dependencies: ['dep-plugin'] });
      await registry.register(dep);
      await registry.register(plugin);
      await registry.activate('dep-plugin', 'store-1');
      await registry.activate('test-plugin', 'store-1');
      expect(registry.isActive('test-plugin', 'store-1')).toBe(true);
    });

    it('deactivates a plugin for a store', async () => {
      const plugin = createMockPlugin();
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');
      await registry.deactivate('test-plugin', 'store-1');
      expect(registry.isActive('test-plugin', 'store-1')).toBe(false);
    });

    it('per-store isolation: activating for one store does not affect another', async () => {
      const plugin = createMockPlugin();
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');
      expect(registry.isActive('test-plugin', 'store-1')).toBe(true);
      expect(registry.isActive('test-plugin', 'store-2')).toBe(false);
    });

    it('deactivating for one store does not affect another', async () => {
      const plugin = createMockPlugin();
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');
      await registry.activate('test-plugin', 'store-2');
      await registry.deactivate('test-plugin', 'store-1');
      expect(registry.isActive('test-plugin', 'store-1')).toBe(false);
      expect(registry.isActive('test-plugin', 'store-2')).toBe(true);
    });
  });

  describe('getActivePlugins', () => {
    it('returns active plugins for a store', async () => {
      const p1 = createMockPlugin({ id: 'p1', name: 'P1' });
      const p2 = createMockPlugin({ id: 'p2', name: 'P2' });
      await registry.register(p1);
      await registry.register(p2);
      await registry.activate('p1', 'store-1');
      await registry.activate('p2', 'store-1');
      const active = registry.getActivePlugins('store-1');
      expect(active).toHaveLength(2);
      expect(active.map((p) => p.id)).toContain('p1');
      expect(active.map((p) => p.id)).toContain('p2');
    });

    it('returns empty for store with no active plugins', () => {
      const active = registry.getActivePlugins('store-1');
      expect(active).toHaveLength(0);
    });
  });

  describe('execute with fault isolation', () => {
    it('returns success on successful execution', async () => {
      const plugin = createMockPlugin({
        execute: async () => ({ success: true, data: { count: 42 } }),
      });
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');

      const context: ExecutionContext = { storeId: 'store-1', triggeredBy: 'test', correlationId: 'corr-1' };
      const result = await registry.execute('test-plugin', context);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ count: 42 });
    });

    it('catches errors and returns failure result', async () => {
      const plugin = createMockPlugin({
        execute: async () => { throw new Error('Plugin crashed'); },
      });
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');

      const context: ExecutionContext = { storeId: 'store-1', triggeredBy: 'test', correlationId: 'corr-1' };
      const result = await registry.execute('test-plugin', context);
      expect(result.success).toBe(false);
      expect(result.errors![0].message).toBe('Plugin crashed');
    });

    it('auto-deactivates after 3 consecutive failures', async () => {
      const plugin = createMockPlugin({
        execute: async () => { throw new Error('Fail'); },
      });
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');

      const context: ExecutionContext = { storeId: 'store-1', triggeredBy: 'test', correlationId: 'corr-1' };

      // First two failures: still active
      await registry.execute('test-plugin', context);
      expect(registry.isActive('test-plugin', 'store-1')).toBe(true);
      await registry.execute('test-plugin', context);
      expect(registry.isActive('test-plugin', 'store-1')).toBe(true);

      // Third failure: auto-deactivated
      await registry.execute('test-plugin', context);
      expect(registry.isActive('test-plugin', 'store-1')).toBe(false);
    });

    it('resets error count on successful execution', async () => {
      let callCount = 0;
      const plugin = createMockPlugin({
        execute: async () => {
          callCount++;
          if (callCount <= 2) throw new Error('Fail');
          return { success: true };
        },
      });
      await registry.register(plugin);
      await registry.activate('test-plugin', 'store-1');

      const context: ExecutionContext = { storeId: 'store-1', triggeredBy: 'test', correlationId: 'corr-1' };

      // Two failures
      await registry.execute('test-plugin', context);
      await registry.execute('test-plugin', context);

      // One success — resets counter
      await registry.execute('test-plugin', context);
      expect(registry.isActive('test-plugin', 'store-1')).toBe(true);

      // Now 2 more failures should not deactivate (needs 3 consecutive)
      callCount = 0; // reset so next calls fail
      await registry.execute('test-plugin', context);
      await registry.execute('test-plugin', context);
      expect(registry.isActive('test-plugin', 'store-1')).toBe(true);
    });

    it('returns error for unregistered plugin', async () => {
      const context: ExecutionContext = { storeId: 'store-1', triggeredBy: 'test', correlationId: 'corr-1' };
      const result = await registry.execute('unknown', context);
      expect(result.success).toBe(false);
      expect(result.errors![0].code).toBe('PLUGIN_NOT_FOUND');
    });

    it('returns error for inactive plugin', async () => {
      const plugin = createMockPlugin();
      await registry.register(plugin);

      const context: ExecutionContext = { storeId: 'store-1', triggeredBy: 'test', correlationId: 'corr-1' };
      const result = await registry.execute('test-plugin', context);
      expect(result.success).toBe(false);
      expect(result.errors![0].code).toBe('PLUGIN_NOT_ACTIVE');
    });
  });
});
