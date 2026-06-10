/**
 * Analytics event subscriber.
 *
 * Subscribes to 'data.normalized' events on the event bus and triggers
 * analytics refresh. Emits 'analytics.updated' event upon completion.
 *
 * Validates: Requirements 4.6
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { EventBus } from '../events/event-bus.js';
import type { SystemEvent } from '@grocery-intel/shared';
import { calculateDailyAnalytics } from './sales-engine.js';

export interface AnalyticsSubscriberOptions {
  pool: pg.Pool;
  eventBus: EventBus;
}

/**
 * Register the analytics subscriber on the event bus.
 * Listens for 'data.normalized' events and triggers analytics refresh
 * for the affected store, then emits 'analytics.updated'.
 */
export function registerAnalyticsSubscriber(options: AnalyticsSubscriberOptions) {
  const { pool, eventBus } = options;

  const subscription = eventBus.subscribe('data.normalized', async (event: SystemEvent) => {
    const { storeId, correlationId } = event;

    try {
      // Trigger a refresh of daily analytics for the last 30 days
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      await calculateDailyAnalytics(pool, storeId, { startDate, endDate });

      // Emit analytics.updated event
      await eventBus.publish({
        type: 'analytics.updated',
        storeId,
        pluginId: 'sales-intelligence',
        payload: { refreshedAt: new Date().toISOString(), triggeredBy: correlationId },
        timestamp: new Date(),
        correlationId: randomUUID(),
      });
    } catch (error) {
      // Log but don't throw — event handler errors are isolated
      console.error(
        `[analytics] Failed to refresh analytics for store ${storeId}:`,
        error
      );
    }
  });

  return subscription;
}
