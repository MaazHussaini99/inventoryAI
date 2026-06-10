/**
 * JWT utility functions for token generation and verification.
 */

import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  storeId: string;
  email: string;
  role: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

function getExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN ?? '7d';
}

/**
 * Sign a JWT token with the given payload.
 */
export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: getExpiresIn() as SignOptions['expiresIn'] };
  return jwt.sign(payload, getSecret(), options);
}

/**
 * Verify and decode a JWT token.
 * Returns the decoded payload or null if invalid/expired.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as JwtPayload & jwt.JwtPayload;
    return {
      userId: decoded.userId,
      storeId: decoded.storeId,
      email: decoded.email,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}
