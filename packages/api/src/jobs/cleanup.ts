/**
 * Automated cleanup job for expired upload files.
 *
 * Handles:
 * - Deleting raw upload files older than 90 days (Requirement 10.5)
 * - Purging account data for users who requested deletion (Requirement 10.6)
 *
 * In production, this would run as a scheduled cron job or via a task queue.
 * For local development, it runs on app startup and can be triggered manually.
 */

import type pg from 'pg';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface CleanupJobOptions {
  pool: pg.Pool;
  uploadDir: string;
  /** Retention period in days for raw upload files (default: 90) */
  retentionDays?: number;
  /** Purge delay in days after account deletion request (default: 30) */
  purgeDelayDays?: number;
}

export interface CleanupResult {
  expiredUploadsDeleted: number;
  accountsPurged: number;
  errors: string[];
}

/**
 * Run the cleanup job: remove expired uploads and purge deleted accounts.
 */
export async function runCleanupJob(options: CleanupJobOptions): Promise<CleanupResult> {
  const { pool, uploadDir, retentionDays = 90, purgeDelayDays = 30 } = options;

  const result: CleanupResult = {
    expiredUploadsDeleted: 0,
    accountsPurged: 0,
    errors: [],
  };

  // 1. Delete expired upload files
  try {
    const expiredUploads = await deleteExpiredUploads(pool, uploadDir, retentionDays);
    result.expiredUploadsDeleted = expiredUploads;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to clean expired uploads: ${msg}`);
  }

  // 2. Purge accounts scheduled for deletion
  try {
    const purged = await purgeDeletedAccounts(pool, purgeDelayDays);
    result.accountsPurged = purged;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Failed to purge deleted accounts: ${msg}`);
  }

  return result;
}

/**
 * Delete raw upload files that have passed the retention period.
 * Keeps analytical data (imported rows, products, sales records) intact.
 */
async function deleteExpiredUploads(
  pool: pg.Pool,
  uploadDir: string,
  retentionDays: number
): Promise<number> {
  const client = await pool.connect();
  try {
    // Find uploads past retention period that still have files on disk
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - retentionDays);

    const result = await client.query(
      `SELECT id, storage_path FROM data_uploads
       WHERE created_at < $1 AND storage_path IS NOT NULL AND status != 'purged'`,
      [expirationDate.toISOString()]
    );

    let deletedCount = 0;

    for (const row of result.rows) {
      try {
        const filePath = resolve(uploadDir, row.storage_path as string);
        await unlink(filePath);
      } catch {
        // File may already be deleted — that's fine
      }

      // Mark the upload as purged (file removed, analytics remain)
      await client.query(
        `UPDATE data_uploads SET storage_path = NULL, status = 'purged' WHERE id = $1`,
        [row.id]
      );
      deletedCount++;
    }

    return deletedCount;
  } finally {
    client.release();
  }
}

/**
 * Purge all data for accounts that were scheduled for deletion
 * more than `purgeDelayDays` ago.
 */
async function purgeDeletedAccounts(
  pool: pg.Pool,
  purgeDelayDays: number
): Promise<number> {
  const client = await pool.connect();
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - purgeDelayDays);

    // Find stores scheduled for deletion past the grace period
    const result = await client.query(
      `SELECT id FROM stores
       WHERE deletion_requested_at IS NOT NULL AND deletion_requested_at < $1`,
      [cutoffDate.toISOString()]
    );

    let purgedCount = 0;

    for (const row of result.rows) {
      const storeId = row.id as string;
      await client.query('BEGIN');
      try {
        // Delete all store data in order of dependencies
        await client.query('DELETE FROM imported_rows WHERE upload_id IN (SELECT id FROM data_uploads WHERE store_id = $1)', [storeId]);
        await client.query('DELETE FROM data_uploads WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM sales_records WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM forecast_records WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM reorder_configs WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM inventory_snapshots WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM duplicate_candidates WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM column_mapping_configs WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM plugin_activations WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM products WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM store_users WHERE store_id = $1', [storeId]);
        await client.query('DELETE FROM stores WHERE id = $1', [storeId]);
        await client.query('COMMIT');
        purgedCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return purgedCount;
  } finally {
    client.release();
  }
}
