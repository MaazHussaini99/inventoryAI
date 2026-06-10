/**
 * Plugin system interfaces for the Grocery Inventory Intelligence platform.
 * These interfaces define the contracts that all plugins must implement.
 */

// ─── Plugin Base Interface ─────────────────────────────────────────────────────

export interface Plugin {
  id: string;
  name: string;
  version: string;
  dependencies: string[];

  initialize(config: PluginConfig): Promise<void>;
  execute(context: ExecutionContext): Promise<PluginResult>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
}

export interface PluginConfig {
  storeId: string;
  settings: Record<string, unknown>;
}

export interface ExecutionContext {
  storeId: string;
  triggeredBy: string;
  correlationId: string;
  payload?: unknown;
}

export interface PluginResult {
  success: boolean;
  data?: unknown;
  errors?: PluginError[];
}

export interface PluginError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface HealthStatus {
  healthy: boolean;
  lastExecution?: Date;
  errorCount: number;
}

// ─── Plugin Registry Interface ─────────────────────────────────────────────────

export interface RegistrationResult {
  success: boolean;
  pluginId: string;
  validationErrors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Event Bus Interface ───────────────────────────────────────────────────────

export interface SystemEvent {
  type: EventType | string;
  storeId: string;
  pluginId: string;
  payload: unknown;
  timestamp: Date;
  correlationId: string;
}

export type EventHandler = (event: SystemEvent) => Promise<void>;

export interface Subscription {
  id: string;
  eventType: string;
  handler: EventHandler;
}

export type EventType =
  | 'data.imported'
  | 'data.normalized'
  | 'analytics.updated'
  | 'forecast.generated'
  | 'reorder.calculated'
  | 'recommendations.ready'
  | 'plugin.activated'
  | 'plugin.deactivated'
  | 'plugin.failed';
