/**
 * Inventory Status API Routes
 *
 * Provides endpoint for inventory status tracking:
 * - GET /api/stores/:id/inventory — Inventory status with filter and pagination
 *
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { guardMiddleware } from '../auth/middleware.js';
import { calculateInventoryStatus } from './engine.js';
import type { InventoryStatus } from './engine.js';

interface StoreParams {
  id: string;
}

interface InventoryQuery {
  status?: InventoryStatus | 'all';
  page?: string;
  pageSize?: string;
}

export async function inventoryRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/stores/:id/inventory
   * Returns inventory status for all active products with optional status filter and pagination.
   */
  fastify.get<{ Params: StoreParams; Querystring: InventoryQuery }>(
    '/api/stores/:id/inventory',
    { preHandler: [guardMiddleware] },
    async (
      request: FastifyRequest<{ Params: StoreParams; Querystring: InventoryQuery }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      // Enforce tenant isolation
      if (id !== request.storeId) {
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'You can only access inventory for your own store.',
            retryable: false,
          },
        });
      }

      const statusFilter = request.query.status ?? 'all';
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize ?? '50', 10) || 50));

      // Calculate inventory status for all products
      const allItems = await calculateInventoryStatus(fastify.pg, id);

      // Apply status filter
      const filteredItems = statusFilter === 'all'
        ? allItems
        : allItems.filter((item) => item.status === statusFilter);

      // Calculate pagination
      const totalItems = filteredItems.length;
      const totalPages = Math.ceil(totalItems / pageSize);
      const startIndex = (page - 1) * pageSize;
      const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

      // Compute summary counts
      const summary = {
        inStock: allItems.filter((item) => item.status === 'in_stock').length,
        lowStock: allItems.filter((item) => item.status === 'low_stock').length,
        outOfStock: allItems.filter((item) => item.status === 'out_of_stock').length,
        discrepancies: allItems.filter((item) => item.hasDiscrepancy).length,
        total: allItems.length,
      };

      return reply.code(200).send({
        items: paginatedItems,
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
        },
        summary,
      });
    }
  );
}
