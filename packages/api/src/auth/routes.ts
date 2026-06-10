/**
 * Authentication routes:
 * - POST /api/auth/register  — Create store + user, hash password, generate verification token
 * - POST /api/auth/login     — Validate credentials, return JWT
 * - POST /api/auth/verify-email — Accept verification token, mark user verified
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { signToken } from './jwt.js';

const SALT_ROUNDS = 10;

interface RegisterBody {
  storeName: string;
  storeCategory: 'grocery' | 'specialty' | 'general';
  storeLocation: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface VerifyEmailBody {
  token: string;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/auth/register
   * Creates a new store and store owner account.
   */
  fastify.post<{ Body: RegisterBody }>(
    '/api/auth/register',
    async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
      const { storeName, storeCategory, storeLocation, name, email, phone, password } =
        request.body;

      // Basic validation
      if (!storeName || !name || !email || !password) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'storeName, name, email, and password are required.',
            retryable: false,
          },
        });
      }

      if (password.length < 8) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Password must be at least 8 characters.',
            retryable: false,
          },
        });
      }

      const client = await fastify.pg.connect();
      try {
        await client.query('BEGIN');

        // Check for existing email
        const existingUser = await client.query(
          'SELECT id FROM store_users WHERE email = $1',
          [email.toLowerCase()]
        );
        if (existingUser.rows.length > 0) {
          await client.query('ROLLBACK');
          return reply.code(409).send({
            error: {
              code: 'EMAIL_EXISTS',
              message: 'An account with this email already exists. Please login instead.',
              retryable: false,
              suggestedAction: 'Use the login endpoint or reset your password.',
            },
          });
        }

        // Create the store
        const storeResult = await client.query(
          `INSERT INTO stores (name, category, location)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [storeName, storeCategory || 'grocery', storeLocation || '']
        );
        const storeId = storeResult.rows[0].id as string;

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Create the store user
        const userResult = await client.query(
          `INSERT INTO store_users (store_id, name, email, phone, password_hash, role, email_verified)
           VALUES ($1, $2, $3, $4, $5, 'owner', FALSE)
           RETURNING id, email_verified`,
          [storeId, name, email.toLowerCase(), phone || null, passwordHash]
        );
        const userId = userResult.rows[0].id as string;

        // Store verification token (using a simple approach: store in a metadata column or log it)
        // For MVP, we store the token in a temporary way and log it.
        // In production, this would be stored in a verification_tokens table and emailed.
        await client.query(
          `CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES store_users(id) ON DELETE CASCADE,
            token VARCHAR(255) NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )`
        );

        await client.query(
          `INSERT INTO email_verification_tokens (user_id, token, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
          [userId, verificationToken]
        );

        await client.query('COMMIT');

        // Log verification token (MVP — in production, send via email)
        fastify.log.info(
          { userId, email: email.toLowerCase(), verificationToken },
          'Email verification token generated'
        );

        return reply.code(201).send({
          userId,
          storeId,
          email: email.toLowerCase(),
          message: 'Registration successful. Please verify your email.',
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );

  /**
   * POST /api/auth/login
   * Validates email/password and returns a JWT token.
   */
  fastify.post<{ Body: LoginBody }>(
    '/api/auth/login',
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, password } = request.body;

      if (!email || !password) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'email and password are required.',
            retryable: false,
          },
        });
      }

      const client = await fastify.pg.connect();
      try {
        const result = await client.query(
          `SELECT id, store_id, name, email, password_hash, role, email_verified
           FROM store_users WHERE email = $1`,
          [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
          return reply.code(401).send({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password.',
              retryable: false,
            },
          });
        }

        const user = result.rows[0];
        const passwordValid = await bcrypt.compare(password, user.password_hash as string);

        if (!passwordValid) {
          return reply.code(401).send({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password.',
              retryable: false,
            },
          });
        }

        // Generate JWT
        const token = signToken({
          userId: user.id as string,
          storeId: user.store_id as string,
          email: user.email as string,
          role: user.role as string,
        });

        return reply.code(200).send({
          token,
          user: {
            id: user.id,
            storeId: user.store_id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerified: user.email_verified,
          },
        });
      } finally {
        client.release();
      }
    }
  );

  /**
   * POST /api/auth/verify-email
   * Accepts a verification token and marks the user as verified.
   */
  fastify.post<{ Body: VerifyEmailBody }>(
    '/api/auth/verify-email',
    async (request: FastifyRequest<{ Body: VerifyEmailBody }>, reply: FastifyReply) => {
      const { token } = request.body;

      if (!token) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Verification token is required.',
            retryable: false,
          },
        });
      }

      const client = await fastify.pg.connect();
      try {
        await client.query('BEGIN');

        // Find the token
        const tokenResult = await client.query(
          `SELECT user_id, expires_at FROM email_verification_tokens
           WHERE token = $1`,
          [token]
        );

        if (tokenResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.code(400).send({
            error: {
              code: 'INVALID_TOKEN',
              message: 'Invalid or expired verification token.',
              retryable: false,
            },
          });
        }

        const { user_id, expires_at } = tokenResult.rows[0];

        // Check expiration
        if (new Date(expires_at as string) < new Date()) {
          await client.query('ROLLBACK');
          return reply.code(400).send({
            error: {
              code: 'TOKEN_EXPIRED',
              message: 'Verification token has expired. Please request a new one.',
              retryable: false,
              suggestedAction: 'Request a new verification email.',
            },
          });
        }

        // Mark user as verified
        await client.query(
          'UPDATE store_users SET email_verified = TRUE WHERE id = $1',
          [user_id]
        );

        // Delete the used token
        await client.query(
          'DELETE FROM email_verification_tokens WHERE token = $1',
          [token]
        );

        await client.query('COMMIT');

        return reply.code(200).send({
          message: 'Email verified successfully.',
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  );

  /**
   * DELETE /api/auth/account
   * Schedules account deletion with a 30-day data purge period.
   * Requires authentication. Sets deletion_requested_at on the store.
   *
   * Validates: Requirement 10.6
   */
  fastify.delete(
    '/api/auth/account',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user;
      if (!user) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
            retryable: false,
          },
          requestId: request.id,
          timestamp: new Date().toISOString(),
        });
      }

      const client = await fastify.pg.connect();
      try {
        // Only owners can delete accounts
        if (user.role !== 'owner') {
          return reply.code(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'Only store owners can request account deletion.',
              retryable: false,
            },
            requestId: request.id,
            timestamp: new Date().toISOString(),
          });
        }

        // Ensure the column exists (create if needed for MVP)
        await client.query(
          `ALTER TABLE stores ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ DEFAULT NULL`
        );

        // Mark store for deletion
        await client.query(
          `UPDATE stores SET deletion_requested_at = NOW() WHERE id = $1`,
          [user.storeId]
        );

        return reply.code(200).send({
          message: 'Account deletion scheduled. All data will be permanently deleted within 30 days.',
          deletionScheduledAt: new Date().toISOString(),
          permanentDeletionBy: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } finally {
        client.release();
      }
    }
  );
}
