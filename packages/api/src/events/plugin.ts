import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { EventBus } from './event-bus.js';

declare module 'fastify' {
  interface FastifyInstance {
    eventBus: EventBus;
  }
}

export interface EventBusPluginOptions {
  redisUrl?: string;
}

/**
 * Fastify plugin that initializes the EventBus and makes it available
 * as `fastify.eventBus` throughout the application.
 */
export const eventBusPlugin = fp(
  async (fastify: FastifyInstance, options: EventBusPluginOptions) => {
    const eventBus = new EventBus();
    await eventBus.initialize(options.redisUrl);

    fastify.decorate('eventBus', eventBus);

    fastify.addHook('onClose', async () => {
      await eventBus.shutdown();
    });
  },
  {
    name: 'event-bus',
  }
);
