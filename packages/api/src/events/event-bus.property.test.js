import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { EventBus } from './event-bus.js';
/**
 * Feature: grocery-inventory-intelligence
 * Property 25: Event Bus Delivery
 *
 * For any published event and set of subscribers, every subscriber registered
 * for that event type should receive the event, and no subscriber registered
 * for a different event type should receive it.
 *
 * **Validates: Requirements 9.5**
 */
// ─── Arbitraries ───────────────────────────────────────────────────────────────
/** Generates a valid event type string */
const eventTypeArb = fc.constantFrom('data.imported', 'data.normalized', 'analytics.updated', 'forecast.generated', 'reorder.calculated', 'recommendations.ready', 'plugin.activated', 'plugin.deactivated', 'plugin.failed');
/** Generates a system event for a given event type */
function systemEventArb(eventType) {
    return fc.record({
        type: fc.constant(eventType),
        storeId: fc.uuid(),
        pluginId: fc.string({ minLength: 1, maxLength: 30 }),
        payload: fc.jsonValue(),
        timestamp: fc.date(),
        correlationId: fc.uuid(),
    });
}
describe('Property 25: Event Bus Delivery', () => {
    let bus;
    beforeEach(async () => {
        bus = new EventBus();
        await bus.initialize();
    });
    afterEach(async () => {
        await bus.shutdown();
    });
    it('every subscriber registered for the event type receives the event', async () => {
        await fc.assert(fc.asyncProperty(eventTypeArb, fc.integer({ min: 1, max: 10 }), async (eventType, numSubscribers) => {
            const localBus = new EventBus();
            await localBus.initialize();
            const received = Array.from({ length: numSubscribers }, () => []);
            // Register N subscribers for the same event type
            for (let i = 0; i < numSubscribers; i++) {
                const idx = i;
                localBus.subscribe(eventType, async (event) => {
                    received[idx].push(event);
                });
            }
            // Create and publish an event
            const event = {
                type: eventType,
                storeId: 'store-1',
                pluginId: 'test-plugin',
                payload: { data: 'test' },
                timestamp: new Date(),
                correlationId: 'corr-1',
            };
            await localBus.publish(event);
            // All subscribers should have received exactly one event
            for (let i = 0; i < numSubscribers; i++) {
                expect(received[i]).toHaveLength(1);
                expect(received[i][0].type).toBe(eventType);
            }
            await localBus.shutdown();
        }), { numRuns: 100 });
    });
    it('no subscriber registered for a different event type receives the event', async () => {
        await fc.assert(fc.asyncProperty(eventTypeArb, eventTypeArb, async (publishedType, subscribedType) => {
            fc.pre(publishedType !== subscribedType);
            const localBus = new EventBus();
            await localBus.initialize();
            const received = [];
            // Subscribe to a different event type
            localBus.subscribe(subscribedType, async (event) => {
                received.push(event);
            });
            // Publish an event of a different type
            const event = {
                type: publishedType,
                storeId: 'store-1',
                pluginId: 'test-plugin',
                payload: {},
                timestamp: new Date(),
                correlationId: 'corr-1',
            };
            await localBus.publish(event);
            // Should NOT have received the event
            expect(received).toHaveLength(0);
            await localBus.shutdown();
        }), { numRuns: 100 });
    });
    it('mixed subscribers: only matching ones receive, non-matching do not', async () => {
        await fc.assert(fc.asyncProperty(eventTypeArb, eventTypeArb, fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 5 }), async (targetType, otherType, numTargetSubs, numOtherSubs) => {
            fc.pre(targetType !== otherType);
            const localBus = new EventBus();
            await localBus.initialize();
            const targetReceived = Array.from({ length: numTargetSubs }, () => []);
            const otherReceived = Array.from({ length: numOtherSubs }, () => []);
            // Subscribe to target type
            for (let i = 0; i < numTargetSubs; i++) {
                const idx = i;
                localBus.subscribe(targetType, async (event) => {
                    targetReceived[idx].push(event);
                });
            }
            // Subscribe to other type
            for (let i = 0; i < numOtherSubs; i++) {
                const idx = i;
                localBus.subscribe(otherType, async (event) => {
                    otherReceived[idx].push(event);
                });
            }
            // Publish an event of the target type
            const event = {
                type: targetType,
                storeId: 'store-1',
                pluginId: 'test-plugin',
                payload: { x: 1 },
                timestamp: new Date(),
                correlationId: 'corr-1',
            };
            await localBus.publish(event);
            // All target subscribers should receive
            for (let i = 0; i < numTargetSubs; i++) {
                expect(targetReceived[i]).toHaveLength(1);
                expect(targetReceived[i][0].type).toBe(targetType);
            }
            // No other subscribers should receive
            for (let i = 0; i < numOtherSubs; i++) {
                expect(otherReceived[i]).toHaveLength(0);
            }
            await localBus.shutdown();
        }), { numRuns: 100 });
    });
    it('published event data is delivered intact to all matching subscribers', async () => {
        await fc.assert(fc.asyncProperty(eventTypeArb.chain((type) => systemEventArb(type)), fc.integer({ min: 1, max: 5 }), async (event, numSubscribers) => {
            const localBus = new EventBus();
            await localBus.initialize();
            const received = [];
            for (let i = 0; i < numSubscribers; i++) {
                localBus.subscribe(event.type, async (e) => {
                    received.push(e);
                });
            }
            await localBus.publish(event);
            // All subscribers should receive the exact same event data
            expect(received).toHaveLength(numSubscribers);
            for (const e of received) {
                expect(e.type).toBe(event.type);
                expect(e.storeId).toBe(event.storeId);
                expect(e.pluginId).toBe(event.pluginId);
                expect(e.correlationId).toBe(event.correlationId);
            }
            await localBus.shutdown();
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=event-bus.property.test.js.map