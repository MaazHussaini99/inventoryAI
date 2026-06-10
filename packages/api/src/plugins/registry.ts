import type {
  Plugin,
  PluginConfig,
  ExecutionContext,
  PluginResult,
  RegistrationResult,
  ValidationResult,
  HealthStatus,
} from '@grocery-intel/shared';

const MAX_CONSECUTIVE_FAILURES = 3;

interface PluginEntry {
  plugin: Plugin;
  activeStores: Set<string>;
  errorCounts: Map<string, number>; // storeId -> consecutive error count
  lastExecution: Map<string, Date>; // storeId -> last execution time
}

/**
 * PluginRegistry manages plugin registration, activation, deactivation,
 * contract validation, and fault isolation.
 */
export class PluginRegistry {
  private plugins: Map<string, PluginEntry> = new Map();

  /**
   * Validates that a plugin implements all required interface methods and has valid metadata.
   */
  validateContract(plugin: unknown): ValidationResult {
    const errors: string[] = [];

    if (!plugin || typeof plugin !== 'object') {
      return { valid: false, errors: ['Plugin must be a non-null object'] };
    }

    const p = plugin as Record<string, unknown>;

    // Validate required metadata fields
    if (!p.id || typeof p.id !== 'string' || p.id.trim() === '') {
      errors.push('Plugin must have a non-empty string "id" field');
    }
    if (!p.name || typeof p.name !== 'string' || p.name.trim() === '') {
      errors.push('Plugin must have a non-empty string "name" field');
    }
    if (!p.version || typeof p.version !== 'string' || p.version.trim() === '') {
      errors.push('Plugin must have a non-empty string "version" field');
    }
    if (!Array.isArray(p.dependencies)) {
      errors.push('Plugin must have a "dependencies" array');
    }

    // Validate required methods
    if (typeof p.initialize !== 'function') {
      errors.push('Plugin must implement "initialize" method');
    }
    if (typeof p.execute !== 'function') {
      errors.push('Plugin must implement "execute" method');
    }
    if (typeof p.shutdown !== 'function') {
      errors.push('Plugin must implement "shutdown" method');
    }
    if (typeof p.healthCheck !== 'function') {
      errors.push('Plugin must implement "healthCheck" method');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Registers a plugin after validating its contract.
   */
  async register(plugin: Plugin): Promise<RegistrationResult> {
    const validation = this.validateContract(plugin);

    if (!validation.valid) {
      return {
        success: false,
        pluginId: plugin?.id ?? '',
        validationErrors: validation.errors,
      };
    }

    if (this.plugins.has(plugin.id)) {
      return {
        success: false,
        pluginId: plugin.id,
        validationErrors: [`Plugin with id "${plugin.id}" is already registered`],
      };
    }

    this.plugins.set(plugin.id, {
      plugin,
      activeStores: new Set(),
      errorCounts: new Map(),
      lastExecution: new Map(),
    });

    return { success: true, pluginId: plugin.id };
  }

  /**
   * Unregisters a plugin, shutting it down first if active.
   */
  async unregister(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return;
    }

    // Shut down if any stores are active
    if (entry.activeStores.size > 0) {
      try {
        await entry.plugin.shutdown();
      } catch {
        // Ignore shutdown errors during unregistration
      }
    }

    this.plugins.delete(pluginId);
  }

  /**
   * Activates a plugin for a specific store.
   */
  async activate(pluginId: string, storeId: string, config?: PluginConfig): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin "${pluginId}" is not registered`);
    }

    if (entry.activeStores.has(storeId)) {
      return; // Already active for this store
    }

    // Check dependencies
    for (const depId of entry.plugin.dependencies) {
      const depEntry = this.plugins.get(depId);
      if (!depEntry || !depEntry.activeStores.has(storeId)) {
        throw new Error(
          `Dependency "${depId}" is not active for store "${storeId}"`
        );
      }
    }

    const pluginConfig: PluginConfig = config ?? { storeId, settings: {} };

    await entry.plugin.initialize(pluginConfig);
    entry.activeStores.add(storeId);
    entry.errorCounts.set(storeId, 0);
  }

  /**
   * Deactivates a plugin for a specific store.
   */
  async deactivate(pluginId: string, storeId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return;
    }

    if (!entry.activeStores.has(storeId)) {
      return; // Not active for this store
    }

    try {
      await entry.plugin.shutdown();
    } catch {
      // Ignore shutdown errors during deactivation
    }

    entry.activeStores.delete(storeId);
    entry.errorCounts.delete(storeId);
    entry.lastExecution.delete(storeId);
  }

  /**
   * Returns all plugins active for a given store.
   */
  getActivePlugins(storeId: string): Plugin[] {
    const active: Plugin[] = [];
    for (const entry of this.plugins.values()) {
      if (entry.activeStores.has(storeId)) {
        active.push(entry.plugin);
      }
    }
    return active;
  }

  /**
   * Returns a registered plugin by ID.
   */
  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  /**
   * Checks if a plugin is active for a given store.
   */
  isActive(pluginId: string, storeId: string): boolean {
    const entry = this.plugins.get(pluginId);
    return entry?.activeStores.has(storeId) ?? false;
  }

  /**
   * Executes a plugin with fault isolation. Wraps the call in try/catch,
   * increments error count on failure, and auto-deactivates after
   * MAX_CONSECUTIVE_FAILURES consecutive failures.
   */
  async execute(
    pluginId: string,
    context: ExecutionContext
  ): Promise<PluginResult> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return {
        success: false,
        errors: [{ code: 'PLUGIN_NOT_FOUND', message: `Plugin "${pluginId}" is not registered`, recoverable: false }],
      };
    }

    if (!entry.activeStores.has(context.storeId)) {
      return {
        success: false,
        errors: [{ code: 'PLUGIN_NOT_ACTIVE', message: `Plugin "${pluginId}" is not active for store "${context.storeId}"`, recoverable: true }],
      };
    }

    try {
      const result = await entry.plugin.execute(context);
      // Reset error count on success
      if (result.success) {
        entry.errorCounts.set(context.storeId, 0);
      }
      entry.lastExecution.set(context.storeId, new Date());
      return result;
    } catch (error: unknown) {
      const currentCount = (entry.errorCounts.get(context.storeId) ?? 0) + 1;
      entry.errorCounts.set(context.storeId, currentCount);
      entry.lastExecution.set(context.storeId, new Date());

      // Auto-deactivate after MAX_CONSECUTIVE_FAILURES consecutive failures
      if (currentCount >= MAX_CONSECUTIVE_FAILURES) {
        entry.activeStores.delete(context.storeId);
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        errors: [{
          code: 'PLUGIN_EXECUTION_ERROR',
          message,
          recoverable: currentCount < MAX_CONSECUTIVE_FAILURES,
        }],
      };
    }
  }

  /**
   * Gets health status for a plugin in the context of a store.
   */
  async getHealthStatus(pluginId: string, storeId: string): Promise<HealthStatus> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return { healthy: false, errorCount: 0 };
    }

    try {
      return await entry.plugin.healthCheck();
    } catch {
      return {
        healthy: false,
        errorCount: entry.errorCounts.get(storeId) ?? 0,
        lastExecution: entry.lastExecution.get(storeId),
      };
    }
  }

  /**
   * Returns all registered plugin IDs.
   */
  getRegisteredPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }
}
