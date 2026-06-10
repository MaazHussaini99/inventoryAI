/**
 * Unit tests for the Sales Intelligence Engine.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateDailyAnalytics,
  getTopProducts,
  getDeadStock,
  getDailyTrends,
} from './sales-engine.js';
import type { DateRange } from './sales-engine.js';

// ─── Mock Setup ────────────────────────────────────────────────────────────────

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
} as unknown as import('pg').Pool;

const storeId = 'store-001';
const dateRange: DateRange = { startDate: '2024-01-01', endDate: '2024-01-31' };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── calculateDailyAnalytics ───────────────────────────────────────────────────

describe('calculateDailyAnalytics', () => {
  it('should return daily analytics aggregated by date', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          date: '2024-01-15',
          total_revenue: '150.50',
          total_units_sold: '25',
          average_transaction_value: '30.10',
          unique_skus_sold: '5',
        },
        {
          date: '2024-01-16',
          total_revenue: '200.00',
          total_units_sold: '40',
          average_transaction_value: '25.00',
          unique_skus_sold: '8',
        },
      ],
    });

    const result = await calculateDailyAnalytics(mockPool, storeId, dateRange);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2024-01-15',
      totalRevenue: 150.5,
      totalUnitsSold: 25,
      averageTransactionValue: 30.1,
      uniqueSkusSold: 5,
    });
    expect(result[1]).toEqual({
      date: '2024-01-16',
      totalRevenue: 200,
      totalUnitsSold: 40,
      averageTransactionValue: 25,
      uniqueSkusSold: 8,
    });
  });

  it('should return empty array when no sales in date range', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const result = await calculateDailyAnalytics(mockPool, storeId, dateRange);

    expect(result).toEqual([]);
  });

  it('should release the client after query', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await calculateDailyAnalytics(mockPool, storeId, dateRange);

    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('should release the client even if query throws', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockRejectedValueOnce(new Error('DB error'));

    await expect(calculateDailyAnalytics(mockPool, storeId, dateRange)).rejects.toThrow('DB error');
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('should pass storeId and date range as query parameters', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await calculateDailyAnalytics(mockPool, storeId, dateRange);

    const analyticsCall = mockClient.query.mock.calls[1];
    expect(analyticsCall[1]).toEqual([storeId, '2024-01-01', '2024-01-31']);
  });
});

// ─── getTopProducts ────────────────────────────────────────────────────────────

describe('getTopProducts', () => {
  it('should return top products ranked by revenue', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({
      rows: [
        { product_id: 'prod-1', product_name: 'Organic Milk', total_revenue: '500.00', total_units_sold: '100' },
        { product_id: 'prod-2', product_name: 'Whole Wheat Bread', total_revenue: '300.00', total_units_sold: '150' },
      ],
    });

    const result = await getTopProducts(mockPool, storeId, dateRange, 'revenue', 20);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      productId: 'prod-1',
      productName: 'Organic Milk',
      totalRevenue: 500,
      totalUnitsSold: 100,
      rank: 1,
    });
    expect(result[1]).toEqual({
      productId: 'prod-2',
      productName: 'Whole Wheat Bread',
      totalRevenue: 300,
      totalUnitsSold: 150,
      rank: 2,
    });
  });

  it('should return top products ranked by units sold', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({
      rows: [
        { product_id: 'prod-2', product_name: 'Whole Wheat Bread', total_revenue: '300.00', total_units_sold: '150' },
        { product_id: 'prod-1', product_name: 'Organic Milk', total_revenue: '500.00', total_units_sold: '100' },
      ],
    });

    const result = await getTopProducts(mockPool, storeId, dateRange, 'units', 20);

    expect(result[0].productName).toBe('Whole Wheat Bread');
    expect(result[0].rank).toBe(1);
    expect(result[1].productName).toBe('Organic Milk');
    expect(result[1].rank).toBe(2);
  });

  it('should default sortBy to revenue and limit to 20', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getTopProducts(mockPool, storeId, dateRange);

    const queryCall = mockClient.query.mock.calls[1];
    expect(queryCall[0]).toContain('total_revenue');
    expect(queryCall[1]).toContain(20);
  });

  it('should respect custom limit', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getTopProducts(mockPool, storeId, dateRange, 'revenue', 5);

    const queryCall = mockClient.query.mock.calls[1];
    expect(queryCall[1][3]).toBe(5);
  });

  it('should release the client after query', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getTopProducts(mockPool, storeId, dateRange);

    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});

// ─── getDeadStock ──────────────────────────────────────────────────────────────

describe('getDeadStock', () => {
  it('should return dead stock items sorted by last sale date ascending', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          product_id: 'prod-dead-1',
          product_name: 'Stale Chips',
          last_sale_date: null,
          estimated_stock: '50',
          days_since_last_sale: '30',
        },
        {
          product_id: 'prod-dead-2',
          product_name: 'Old Crackers',
          last_sale_date: '2023-12-01',
          estimated_stock: '20',
          days_since_last_sale: '45',
        },
      ],
    });

    const result = await getDeadStock(mockPool, storeId, 30);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      productId: 'prod-dead-1',
      productName: 'Stale Chips',
      lastSaleDate: null,
      estimatedStock: 50,
      daysSinceLastSale: 30,
    });
    expect(result[1]).toEqual({
      productId: 'prod-dead-2',
      productName: 'Old Crackers',
      lastSaleDate: '2023-12-01',
      estimatedStock: 20,
      daysSinceLastSale: 45,
    });
  });

  it('should default daysThreshold to 30', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getDeadStock(mockPool, storeId);

    const queryCall = mockClient.query.mock.calls[1];
    expect(queryCall[1]).toContain(30);
  });

  it('should pass custom daysThreshold', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getDeadStock(mockPool, storeId, 60);

    const queryCall = mockClient.query.mock.calls[1];
    expect(queryCall[1]).toContain(60);
  });

  it('should return empty array when all products have recent sales', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const result = await getDeadStock(mockPool, storeId);

    expect(result).toEqual([]);
  });

  it('should release the client after query', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getDeadStock(mockPool, storeId);

    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});

// ─── getDailyTrends ────────────────────────────────────────────────────────────

describe('getDailyTrends', () => {
  it('should return daily trends with day-of-week info', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({
      rows: [
        { date: '2024-01-15', day_of_week: '1', revenue: '250.00', units_sold: '45' },
        { date: '2024-01-16', day_of_week: '2', revenue: '180.00', units_sold: '30' },
        { date: '2024-01-20', day_of_week: '6', revenue: '400.00', units_sold: '80' },
      ],
    });

    const result = await getDailyTrends(mockPool, storeId, dateRange);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      date: '2024-01-15',
      dayOfWeek: 1, // Monday
      revenue: 250,
      unitsSold: 45,
    });
    expect(result[2]).toEqual({
      date: '2024-01-20',
      dayOfWeek: 6, // Saturday
      revenue: 400,
      unitsSold: 80,
    });
  });

  it('should return empty array when no trends in range', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const result = await getDailyTrends(mockPool, storeId, dateRange);

    expect(result).toEqual([]);
  });

  it('should include Sunday as day 0 and Saturday as day 6', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({
      rows: [
        { date: '2024-01-14', day_of_week: '0', revenue: '300.00', units_sold: '60' },
      ],
    });

    const result = await getDailyTrends(mockPool, storeId, dateRange);

    expect(result[0].dayOfWeek).toBe(0); // Sunday
  });

  it('should release the client after query', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getDailyTrends(mockPool, storeId, dateRange);

    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it('should pass storeId and date range as query parameters', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // set_config
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await getDailyTrends(mockPool, storeId, dateRange);

    const queryCall = mockClient.query.mock.calls[1];
    expect(queryCall[1]).toEqual([storeId, '2024-01-01', '2024-01-31']);
  });
});
