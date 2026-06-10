/**
 * Unit tests for the cleanup job.
 *
 * Validates: Requirements 10.5, 10.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCleanupJob } from './cleanup.js';

// ─── Mock Setup ────────────────────────────────────────────────────────────────

const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
} as unknown as import('pg').Pool;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('runCleanupJob', () => {
  it('should return zero counts when no expired uploads or deleted accounts exist', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result = await runCleanupJob({
      pool: mockPool,
      uploadDir: '/tmp/uploads',
      retentionDays: 90,
      purgeDelayDays: 30,
    });

    expect(result.expiredUploadsDeleted).toBe(0);
    expect(result.accountsPurged).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should query for uploads older than retention period', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await runCleanupJob({
      pool: mockPool,
      uploadDir: '/tmp/uploads',
      retentionDays: 90,
      purgeDelayDays: 30,
    });

    // First query should look for expired uploads
    const firstCall = mockClient.query.mock.calls[0];
    expect(firstCall[0]).toContain('data_uploads');
    expect(firstCall[0]).toContain('created_at');
  });

  it('should query for stores with deletion_requested_at past purge delay', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await runCleanupJob({
      pool: mockPool,
      uploadDir: '/tmp/uploads',
      retentionDays: 90,
      purgeDelayDays: 30,
    });

    // Second query should look for deleted accounts
    const secondCall = mockClient.query.mock.calls[1];
    expect(secondCall[0]).toContain('stores');
    expect(secondCall[0]).toContain('deletion_requested_at');
  });

  it('should handle errors gracefully without throwing', async () => {
    const failingPool = {
      connect: vi.fn().mockRejectedValue(new Error('DB unavailable')),
    } as unknown as import('pg').Pool;

    const result = await runCleanupJob({
      pool: failingPool,
      uploadDir: '/tmp/uploads',
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Failed to clean expired uploads');
  });

  it('should use default retention and purge delay values', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result = await runCleanupJob({
      pool: mockPool,
      uploadDir: '/tmp/uploads',
    });

    // Should complete without errors using defaults
    expect(result.errors).toHaveLength(0);
  });

  it('should mark uploads as purged after deleting files', async () => {
    // First connect: for deleteExpiredUploads
    const uploadClient = {
      query: vi.fn()
        // SELECT expired uploads
        .mockResolvedValueOnce({
          rows: [{ id: 'upload-1', storage_path: 'store-1/file.csv' }],
        })
        // UPDATE to mark as purged
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };

    // Second connect: for purgeDeletedAccounts
    const purgeClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn()
        .mockResolvedValueOnce(uploadClient)
        .mockResolvedValueOnce(purgeClient),
    } as unknown as import('pg').Pool;

    const result = await runCleanupJob({
      pool,
      uploadDir: '/tmp/uploads',
    });

    expect(result.expiredUploadsDeleted).toBe(1);

    // Should have called UPDATE to mark as purged
    const updateCall = uploadClient.query.mock.calls[1];
    expect(updateCall[0]).toContain('UPDATE data_uploads');
    expect(updateCall[0]).toContain('purged');
  });
});
