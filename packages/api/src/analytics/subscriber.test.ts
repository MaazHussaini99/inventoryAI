/**
 * Unit tests for the Analytics event subscriber.
 *
 * Validates: Requirements 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAnalyticsSubscriber } from './subscriber.js';
import type { SystemEvent } from '@grocery-intel/shared';

// ─── Mock Setup ────────────────────────────────────────────────────────────────

const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
} as unknown as import('pg').Pool;

let subscribedHandler: ((event: SystemEvent) => Promise<void>) | null = null;

const mockEventBus = {
  subscribe: vi.fn((eventType: string, handler: (event: SystemEvent) => Promise<void>) => {
    subscribedHandler = handler;
    return { id: 'sub-1', eventType, handler };
  }),
  publish: vi.fn().mockResolvedValue(undefined),
} as unknown as import('../events/event-bus.js').EventBus;

beforeEach(() => {
  vi.clearAllMocks();
  subscribedHandler = null;
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('registerAnalyticsSubscriber', () => {
  it('should subscribe to data.imported events', () => {
    registerAnalyticsSubscriber({ pool: mockPool, eventBus: mockEventBus });

    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'data.imported',
      expect.any(Function)
    );
  });

  it('should return the subscription', () => {
    const subscription = registerAnalyticsSubscriber({ pool: mockPool, eventBus: mockEventBus });

    expect(subscription).toHaveProperty('id', 'sub-1');
    expect(subscription).toHaveProperty('eventType', 'data.imported');
  });

  it('should emit analytics.updated event after processing', async () => {
    registerAnalyticsSubscriber({ pool: mockPool, eventBus: mockEventBus });

    const event: SystemEvent = {
      type: 'data.imported',
      storeId: 'store-001',
      pluginId: 'data-ingestion',
      payload: {},
      timestamp: new Date(),
      correlationId: 'corr-123',
    };

    await subscribedHandler!(event);

    expect(mockEventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'analytics.updated',
        storeId: 'store-001',
        pluginId: 'sales-intelligence',
      })
    );
  });

  it('should include correlationId from triggering event in payload', async () => {
    registerAnalyticsSubscriber({ pool: mockPool, eventBus: mockEventBus });

    const event: SystemEvent = {
      type: 'data.imported',
      storeId: 'store-001',
      pluginId: 'data-ingestion',
      payload: {},
      timestamp: new Date(),
      correlationId: 'corr-456',
    };

    await subscribedHandler!(event);

    const publishedEvent = (mockEventBus.publish as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(publishedEvent.payload).toHaveProperty('triggeredBy', 'corr-456');
  });

  it('should not throw if analytics calculation fails', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB connection lost'));
    // But the second call for set_config should work - let's set both to fail
    mockPool.connect = vi.fn().mockRejectedValue(new Error('DB connection lost'));

    registerAnalyticsSubscriber({ pool: mockPool, eventBus: mockEventBus });

    const event: SystemEvent = {
      type: 'data.imported',
      storeId: 'store-001',
      pluginId: 'data-ingestion',
      payload: {},
      timestamp: new Date(),
      correlationId: 'corr-789',
    };

    // Should not throw
    await expect(subscribedHandler!(event)).resolves.not.toThrow();
    // Should not emit analytics.updated on failure
    expect(mockEventBus.publish).not.toHaveBeenCalled();
  });
});
