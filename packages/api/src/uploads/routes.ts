/**
 * File upload routes:
 * - POST /api/uploads         — Upload a CSV/XLSX/XLS file for data ingestion
 * - GET  /api/uploads/:id/preview — Parse file and return headers, sample rows, and suggested mappings
 * - POST /api/uploads/:id/mapping — Confirm and save column mappings
 * - POST /api/uploads/:id/process — Process the uploaded file (validate rows, import data)
 */

import { randomUUID } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { guardMiddleware } from '../auth/middleware.js';
import { getStoreClient } from '../db/plugin.js';
import { parseFile } from './parser.js';
import { suggestColumnMappings } from './column-mapper.js';
import { processUpload } from './processor.js';
import type { ColumnMapping, FileFormat } from '@grocery-intel/shared';

/** Allowed file extensions (lowercase, with dot) */
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);

/** Max file size in bytes (default 50 MB) */
function getMaxFileSize(): number {
  const mb = parseInt(process.env.UPLOAD_MAX_SIZE_MB ?? '50', 10);
  return mb * 1024 * 1024;
}

/** Upload retention in days (default 90) */
function getRetentionDays(): number {
  return parseInt(process.env.UPLOAD_RETENTION_DAYS ?? '90', 10);
}

/** Base upload directory */
function getUploadDir(): string {
  return resolve(process.env.UPLOAD_DIR ?? './uploads');
}

/** Map file extension to FileFormat */
function extToFormat(ext: string): 'csv' | 'xlsx' | 'xls' {
  const lower = ext.toLowerCase();
  if (lower === '.csv') return 'csv';
  if (lower === '.xlsx') return 'xlsx';
  if (lower === '.xls') return 'xls';
  throw new Error(`Unsupported extension: ${ext}`);
}

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/uploads
   * Accepts multipart file upload, validates format/size, stores to filesystem,
   * and creates a DataUpload record.
   */
  fastify.post(
    '/api/uploads',
    { preHandler: [guardMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const storeId = request.storeId;
      const userId = request.user?.userId;

      if (!storeId || !userId) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
            retryable: false,
          },
        });
      }

      // Get the uploaded file from multipart request
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({
          error: {
            code: 'NO_FILE',
            message: 'No file was provided in the request.',
            retryable: false,
            suggestedAction: 'Please attach a file to the request using multipart form data.',
          },
        });
      }

      const originalFilename = data.filename;
      const ext = extname(originalFilename).toLowerCase();

      // Validate file extension
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_FORMAT',
            message: `Unsupported file format "${ext}". Accepted formats: .csv, .xlsx, .xls`,
            retryable: false,
            suggestedAction: 'Please upload a file in CSV (.csv) or Excel (.xlsx, .xls) format.',
          },
        });
      }

      // Read the file buffer
      const buffer = await data.toBuffer();
      const fileSizeBytes = buffer.length;

      // Validate file size
      const maxSize = getMaxFileSize();
      if (fileSizeBytes > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        return reply.code(400).send({
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size (${Math.round(fileSizeBytes / (1024 * 1024))}MB) exceeds the maximum allowed size of ${maxMB}MB.`,
            retryable: false,
            suggestedAction: `Please upload a file smaller than ${maxMB}MB.`,
          },
        });
      }

      // Generate upload ID and storage path
      const uploadId = randomUUID();
      const storedFilename = `${uploadId}-${originalFilename}`;
      const storeDir = resolve(getUploadDir(), storeId);
      const storagePath = resolve(storeDir, storedFilename);
      const relativeStoragePath = `${storeId}/${storedFilename}`;

      // Ensure store-scoped directory exists
      await mkdir(storeDir, { recursive: true });

      // Write file to disk
      await writeFile(storagePath, buffer);

      // Calculate expiration date
      const retentionDays = getRetentionDays();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + retentionDays);

      const fileFormat = extToFormat(ext);

      // Create DataUpload record in database
      const client = await getStoreClient(fastify.pg, storeId);
      try {
        const result = await client.query(
          `INSERT INTO data_uploads (id, store_id, uploaded_by, file_name, file_format, file_size_bytes, storage_path, status, total_rows, imported_rows, skipped_rows, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 0, 0, 0, NOW(), $8)
           RETURNING id, status, created_at, expires_at`,
          [uploadId, storeId, userId, originalFilename, fileFormat, fileSizeBytes, relativeStoragePath, expiresAt]
        );

        const upload = result.rows[0];

        return reply.code(201).send({
          upload: {
            id: upload.id,
            fileName: originalFilename,
            fileFormat,
            fileSizeBytes,
            status: upload.status,
            createdAt: upload.created_at,
            expiresAt: upload.expires_at,
          },
        });
      } catch (err) {
        request.log.error(err, 'Failed to create DataUpload record');
        return reply.code(500).send({
          error: {
            code: 'UPLOAD_FAILED',
            message: 'Failed to save upload record. Please try again.',
            retryable: true,
          },
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * GET /api/uploads/:id/preview
   * Parses the uploaded file and returns headers, sample rows, and suggested column mappings.
   * Updates DataUpload status: pending → parsing → mapping.
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/uploads/:id/preview',
    { preHandler: [guardMiddleware] },
    async (request, reply) => {
      const storeId = request.storeId;
      if (!storeId) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
            retryable: false,
          },
        });
      }

      const uploadId = request.params.id;
      const client = await getStoreClient(fastify.pg, storeId);

      try {
        // Fetch the upload record
        const uploadResult = await client.query(
          `SELECT id, store_id, file_name, file_format, storage_path, status
           FROM data_uploads WHERE id = $1 AND store_id = $2`,
          [uploadId, storeId]
        );

        if (uploadResult.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Upload not found.',
              retryable: false,
            },
          });
        }

        const upload = uploadResult.rows[0];

        // Update status to 'parsing'
        await client.query(
          `UPDATE data_uploads SET status = 'parsing' WHERE id = $1`,
          [uploadId]
        );

        // Resolve the absolute file path
        const uploadDir = getUploadDir();
        const filePath = resolve(uploadDir, upload.storage_path);

        // Parse the file
        const parseResult = await parseFile(filePath, upload.file_format as FileFormat);

        // Generate suggested column mappings
        const suggestedMappings = suggestColumnMappings(parseResult.headers);

        // Update status to 'mapping' and set total_rows
        await client.query(
          `UPDATE data_uploads SET status = 'mapping', total_rows = $1 WHERE id = $2`,
          [parseResult.totalRows, uploadId]
        );

        return reply.code(200).send({
          uploadId,
          fileName: upload.file_name,
          fileFormat: upload.file_format,
          headers: parseResult.headers,
          sampleRows: parseResult.sampleRows,
          totalRows: parseResult.totalRows,
          suggestedMappings,
        });
      } catch (err) {
        // On parse error, set status back to 'failed'
        try {
          await client.query(
            `UPDATE data_uploads SET status = 'failed' WHERE id = $1`,
            [uploadId]
          );
        } catch {
          // Ignore secondary error
        }
        request.log.error(err, 'Failed to parse uploaded file');
        return reply.code(500).send({
          error: {
            code: 'PARSE_FAILED',
            message: 'Failed to parse the uploaded file. The file may be corrupted.',
            retryable: false,
            suggestedAction: 'Please verify the file is a valid CSV or Excel file and re-upload.',
          },
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * POST /api/uploads/:id/mapping
   * Confirms and saves the column mapping for an upload.
   * Saves to both the DataUpload record and a ColumnMappingConfig record for reuse.
   */
  fastify.post<{ Params: { id: string }; Body: { mappings: ColumnMapping[] } }>(
    '/api/uploads/:id/mapping',
    { preHandler: [guardMiddleware] },
    async (request, reply) => {
      const storeId = request.storeId;
      if (!storeId) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
            retryable: false,
          },
        });
      }

      const uploadId = request.params.id;
      const { mappings } = request.body as { mappings: ColumnMapping[] };

      if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_MAPPING',
            message: 'A non-empty mappings array is required.',
            retryable: false,
            suggestedAction: 'Provide at least one column mapping.',
          },
        });
      }

      const client = await getStoreClient(fastify.pg, storeId);

      try {
        // Fetch the upload record
        const uploadResult = await client.query(
          `SELECT id, store_id, file_name, status
           FROM data_uploads WHERE id = $1 AND store_id = $2`,
          [uploadId, storeId]
        );

        if (uploadResult.rows.length === 0) {
          return reply.code(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'Upload not found.',
              retryable: false,
            },
          });
        }

        const upload = uploadResult.rows[0];

        // Save column mapping to the DataUpload record
        await client.query(
          `UPDATE data_uploads SET column_mapping = $1, status = 'processing' WHERE id = $2`,
          [JSON.stringify(mappings), uploadId]
        );

        // Save/update ColumnMappingConfig for reuse (keyed by store + source filename)
        const sourceIdentifier = upload.file_name;
        await client.query(
          `INSERT INTO column_mapping_configs (id, store_id, source_identifier, mapping, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (store_id, source_identifier)
           DO UPDATE SET mapping = EXCLUDED.mapping, updated_at = NOW()`,
          [randomUUID(), storeId, sourceIdentifier, JSON.stringify(mappings)]
        );

        return reply.code(200).send({
          uploadId,
          status: 'processing',
          mappings,
          message: 'Column mapping saved successfully.',
        });
      } catch (err) {
        request.log.error(err, 'Failed to save column mapping');
        return reply.code(500).send({
          error: {
            code: 'MAPPING_SAVE_FAILED',
            message: 'Failed to save the column mapping. Please try again.',
            retryable: true,
          },
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * POST /api/uploads/:id/process
   * Triggers import processing of an upload that has confirmed column mappings.
   * Returns an import summary with total, imported, skipped rows and date range.
   */
  fastify.post<{ Params: { id: string } }>(
    '/api/uploads/:id/process',
    { preHandler: [guardMiddleware] },
    async (request, reply) => {
      const storeId = request.storeId;
      if (!storeId) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
            retryable: false,
          },
        });
      }

      const uploadId = request.params.id;

      try {
        const summary = await processUpload(uploadId, storeId, {
          pool: fastify.pg,
          eventBus: fastify.eventBus,
          uploadDir: getUploadDir(),
        });

        return reply.code(200).send({
          uploadId: summary.uploadId,
          status: 'completed',
          summary: {
            total_rows: summary.totalRows,
            imported_rows: summary.importedRows,
            skipped_rows: summary.skippedRows,
            date_range: summary.dateRange,
          },
        });
      } catch (err) {
        request.log.error(err, 'Failed to process upload');
        const message = err instanceof Error ? err.message : 'Unknown processing error';
        return reply.code(500).send({
          error: {
            code: 'PROCESSING_FAILED',
            message: `Failed to process the upload: ${message}`,
            retryable: false,
            suggestedAction: 'Please verify the upload has a valid column mapping and try again.',
          },
        });
      }
    }
  );
}
