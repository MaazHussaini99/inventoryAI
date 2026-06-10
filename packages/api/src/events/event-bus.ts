import { randomUUID } from 'node:crypto';
import type { SystemEvent, EventHandler, Subscription } from '@grocery-intel/shared';

/**
 * EventBus provides pub/sub messaging for inter-plugin communication.
 * Uses Redis pub/sub when available, with an in-process fallback for
 * local development or when Redis is unavailable.
 */
export class EventBus {
  private subscribers: Map<string, Subscription[]> = new Map();
  private redisPublisher: RedisLike | null = null;
  private redisSubscriber: RedisLike | null = null;
  private useRedis = false;
  private channelPrefix = 'grocery-intel:events:';

  /**
   * Initialize the event bus. Attempts to connect to Redis for distributed
   * pub/sub. Falls back to in-process event handling if Redis is unavailable.
   */
  async initialize(redisUrl?: string): Promise<void> {
    if (!redisUrl) {
      this.useRedis = false;
      return;
    }

    try {
      // Dynamic import to avoid hard dependency on ioredis at module load
      const { default: Redis } = await import('ioredis');
      this.redisPublisher = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
      this.redisSubscriber = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });

      await (this.redisPublisher as ConnectableRedis).connect();
      await (this.redisSubscriber as ConnectableRedis).connect();

      // Set up Redis message handler
      (this.redisSubscriber as MessageRedis).on('message', (channel: string, message: string) => {
        const eventType = channel.replace(this.channelPrefix, '');
        this.dispatchToLocalSubscribers(eventType, JSON.parse(message) as SystemEvent);
      });

      this.useRedis = true;
    } catch {
      // Redis unavailable — fall back to in-process
      this.redisPublisher = null;
      this.redisSubscriber = null;
      this.useRedis = false;
    }
  }

  /**
   * Publish an event to all subscribers of the event type.
   */
  async publish(event: SystemEvent): Promise<void> {
    if (this.useRedis && this.redisPublisher) {
      const channel = `${this.channelPrefix}${event.type}`;
      await (this.redisPublisher as PublishRedis).publish(channel, JSON.stringify(event));
    } else {
      // In-process fallback
      await this.dispatchToLocalSubscribers(event.type, event);
    }
  }

  /**
   * Subscribe to events of a specific type.
   */
  subscribe(eventType: string, handler: EventHandler): Subscription {
    const subscription: Subscription = {
      id: randomUUID(),
      eventType,
      handler,
    };

    const existing = this.subscribers.get(eventType) ?? [];
    existing.push(subscription);
    this.subscribers.set(eventType, existing);

    // If using Redis, subscribe to the Redis channel
    if (this.useRedis && this.redisSubscriber) {
      const channel = `${this.channelPrefix}${eventType}`;
      (this.redisSubscriber as SubscribeRedis).subscribe(channel).catch(() => {
        // Ignore subscription errors — local fallback will still work
      });
    }

    return subscription;
  }

  /**
   * Remove a subscription.
   */
  unsubscribe(subscription: Subscription): void {
    const subs = this.subscribers.get(subscription.eventType);
    if (!subs) return;

    const filtered = subs.filter((s) => s.id !== subscription.id);
    if (filtered.length === 0) {
      this.subscribers.delete(subscription.eventType);

      // Unsubscribe from Redis channel if no more local subscribers
      if (this.useRedis && this.redisSubscriber) {
        const channel = `${this.channelPrefix}${subscription.eventType}`;
        (this.redisSubscriber as SubscribeRedis).unsubscribe(channel).catch(() => {
          // Ignore
        });
      }
    } else {
      this.subscribers.set(subscription.eventType, filtered);
    }
  }

  /**
   * Get all subscriptions for a given event type.
   */
  getSubscriptions(eventType: string): Subscription[] {
    return this.subscribers.get(eventType) ?? [];
  }

  /**
   * Shut down the event bus and close Redis connections.
   */
  async shutdown(): Promise<void> {
    if (this.redisSubscriber) {
      await (this.redisSubscriber as DisconnectRedis).quit();
      this.redisSubscriber = null;
    }
    if (this.redisPublisher) {
      await (this.redisPublisher as DisconnectRedis).quit();
      this.redisPublisher = null;
    }
    this.subscribers.clear();
    this.useRedis = false;
  }

  /**
   * Whether the event bus is using Redis for distributed messaging.
   */
  get isDistributed(): boolean {
    return this.useRedis;
  }

  /**
   * Dispatch an event to all local subscribers of the event type.
   * Errors in individual handlers are caught and logged to prevent
   * one failing subscriber from affecting others.
   */
  private async dispatchToLocalSubscribers(eventType: string, event: SystemEvent): Promise<void> {
    const subs = this.subscribers.get(eventType) ?? [];

    await Promise.allSettled(
      subs.map((sub) => sub.handler(event))
    );
  }
}

// ─── Minimal Redis type abstractions (avoid importing full ioredis types) ──────

interface RedisLike {
  // Marker interface for Redis instances
}

interface ConnectableRedis {
  connect(): Promise<void>;
}

interface PublishRedis {
  publish(channel: string, message: string): Promise<number>;
}

interface SubscribeRedis {
  subscribe(channel: string): Promise<number>;
  unsubscribe(channel: string): Promise<number>;
}

interface MessageRedis {
  on(event: 'message', listener: (channel: string, message: string) => void): void;
}

interface DisconnectRedis {
  quit(): Promise<string>;
}
