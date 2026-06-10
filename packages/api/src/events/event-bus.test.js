import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from './event-bus.js';
function createTestEvent(overrides = {}) {
    return {
        type: 'data.imported',
        storeId: 'store-1',
        pluginId: 'ingestion-plugin',
        payload: { rows: 100 },
        timestamp: new Date(),
        correlationId: 'corr-123',
        ...overrides,
    };
}
describe('EventBus', () => {
    let bus;
    beforeEach(async () => {
        bus = new EventBus();
        // Initialize without Redis (in-process mode)
        await bus.initialize();
    });
    afterEach(async () => {
        await bus.shutdown();
    });
    describe('initialization', () => {
        it('initializes in local mode without Redis URL', async () => {
            expect(bus.isDistributed).toBe(false);
        });
        it('falls back to local mode with invalid Redis URL', async () => {
            const localBus = new EventBus();
            await localBus.initialize('redis://invalid-host:9999');
            expect(localBus.isDistributed).toBe(false);
            await localBus.shutdown();
        });
    });
    describe('subscribe / unsubscribe', () => {
        it('returns a subscription with unique id', () => {
            const sub = bus.subscribe('data.imported', async () => { });
            expect(sub.id).toBeDefined();
            expect(sub.eventType).toBe('data.imported');
        });
        it('removes subscription on unsubscribe', () => {
            const sub = bus.subscribe('data.imported', async () => { });
            bus.unsubscribe(sub);
            expect(bus.getSubscriptions('data.imported')).toHaveLength(0);
        });
        it('only removes specified subscription', () => {
            const sub1 = bus.subscribe('data.imported', async () => { });
            const sub2 = bus.subscribe('data.imported', async () => { });
            bus.unsubscribe(sub1);
            expect(bus.getSubscriptions('data.imported')).toHaveLength(1);
            expect(bus.getSubscriptions('data.imported')[0].id).toBe(sub2.id);
        });
    });
    describe('publish', () => {
        it('delivers event to matching subscribers', async () => {
            const received = [];
            bus.subscribe('data.imported', async (event) => {
                received.push(event);
            });
            const event = createTestEvent();
            await bus.publish(event);
            expect(received).toHaveLength(1);
            expect(received[0].type).toBe('data.imported');
            expect(received[0].storeId).toBe('store-1');
        });
        it('does not deliver to subscribers of different event types', async () => {
            const received = [];
            bus.subscribe('analytics.updated', async (event) => {
                received.push(event);
            });
            const event = createTestEvent({ type: 'data.imported' });
            await bus.publish(event);
            expect(received).toHaveLength(0);
        });
        it('delivers to multiple subscribers of the same type', async () => {
            const received1 = [];
            const received2 = [];
            bus.subscribe('data.imported', async (event) => { received1.push(event); });
            bus.subscribe('data.imported', async (event) => { received2.push(event); });
            await bus.publish(createTestEvent());
            expect(received1).toHaveLength(1);
            expect(received2).toHaveLength(1);
        });
        it('isolates handler failures — one failing handler does not prevent delivery to others', async () => {
            const received = [];
            bus.subscribe('data.imported', async () => {
                throw new Error('Handler error');
            });
            bus.subscribe('data.imported', async (event) => {
                received.push(event);
            });
            await bus.publish(createTestEvent());
            // Second handler still receives the event
            expect(received).toHaveLength(1);
        });
        it('does not deliver after unsubscribe', async () => {
            const received = [];
            const sub = bus.subscribe('data.imported', async (event) => {
                received.push(event);
            });
            bus.unsubscribe(sub);
            await bus.publish(createTestEvent());
            expect(received).toHaveLength(0);
        });
    });
    describe('shutdown', () => {
        it('clears all subscriptions on shutdown', async () => {
            bus.subscribe('data.imported', async () => { });
            bus.subscribe('analytics.updated', async () => { });
            await bus.shutdown();
            expect(bus.getSubscriptions('data.imported')).toHaveLength(0);
            expect(bus.getSubscriptions('analytics.updated')).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=event-bus.test.js.map