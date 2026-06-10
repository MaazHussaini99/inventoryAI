/**
 * Fastify auth middleware and guard preHandler.
 *
 * - `authMiddleware`: Global onRequest hook that decodes JWT (if present)
 *   and attaches user info + storeId to the request.
 * - `guardMiddleware`: Route-level preHandler that rejects unauthenticated
 *   requests with 401.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './jwt.js';

/**
 * Global onRequest hook: attempts to decode the Authorization header.
 * Does NOT reject unauthenticated requests — use guardMiddleware for that.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (payload) {
    request.user = payload;
    request.storeId = payload.storeId;
  }
}

/**
 * Route-level preHandler: rejects requests without a valid JWT with 401.
 */
export async function guardMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid Bearer token.',
        retryable: false,
      },
    });
  }
}
