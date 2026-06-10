/**
 * Unit tests for the auth module: JWT utilities, middleware, and route behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signToken, verifyToken, type JwtPayload } from './jwt.js';
import { authMiddleware, guardMiddleware } from './middleware.js';

// Set env vars for JWT
beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-key-for-testing';
  process.env.JWT_EXPIRES_IN = '1h';
});

afterEach(() => {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_EXPIRES_IN;
});

describe('JWT utilities', () => {
  const samplePayload: JwtPayload = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    storeId: '660e8400-e29b-41d4-a716-446655440001',
    email: 'owner@store.com',
    role: 'owner',
  };

  it('should sign and verify a token successfully', () => {
    const token = signToken(samplePayload);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe(samplePayload.userId);
    expect(decoded!.storeId).toBe(samplePayload.storeId);
    expect(decoded!.email).toBe(samplePayload.email);
    expect(decoded!.role).toBe(samplePayload.role);
  });

  it('should return null for an invalid token', () => {
    const decoded = verifyToken('invalid.token.value');
    expect(decoded).toBeNull();
  });

  it('should return null for a token signed with wrong secret', () => {
    const token = signToken(samplePayload);
    process.env.JWT_SECRET = 'different-secret';
    const decoded = verifyToken(token);
    expect(decoded).toBeNull();
  });

  it('should throw if JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => signToken(samplePayload)).toThrow('JWT_SECRET environment variable is not set');
  });
});

describe('authMiddleware', () => {
  const samplePayload: JwtPayload = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    storeId: '660e8400-e29b-41d4-a716-446655440001',
    email: 'owner@store.com',
    role: 'owner',
  };

  it('should set user and storeId on request when valid Bearer token is present', async () => {
    const token = signToken(samplePayload);
    const request = {
      headers: { authorization: `Bearer ${token}` },
      user: undefined,
      storeId: undefined,
    } as any;
    const reply = {} as any;

    await authMiddleware(request, reply);

    expect(request.user).toBeDefined();
    expect(request.user!.userId).toBe(samplePayload.userId);
    expect(request.storeId).toBe(samplePayload.storeId);
  });

  it('should not set user when no authorization header is present', async () => {
    const request = {
      headers: {},
      user: undefined,
      storeId: undefined,
    } as any;
    const reply = {} as any;

    await authMiddleware(request, reply);

    expect(request.user).toBeUndefined();
    expect(request.storeId).toBeUndefined();
  });

  it('should not set user when authorization header is not Bearer', async () => {
    const request = {
      headers: { authorization: 'Basic abc123' },
      user: undefined,
      storeId: undefined,
    } as any;
    const reply = {} as any;

    await authMiddleware(request, reply);

    expect(request.user).toBeUndefined();
  });

  it('should not set user when token is invalid', async () => {
    const request = {
      headers: { authorization: 'Bearer invalid-token' },
      user: undefined,
      storeId: undefined,
    } as any;
    const reply = {} as any;

    await authMiddleware(request, reply);

    expect(request.user).toBeUndefined();
    expect(request.storeId).toBeUndefined();
  });
});

describe('guardMiddleware', () => {
  it('should send 401 when request.user is not set', async () => {
    const request = { user: undefined } as any;
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as any;

    await guardMiddleware(request, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
      })
    );
  });

  it('should not send a response when request.user is set', async () => {
    const request = {
      user: {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        storeId: '660e8400-e29b-41d4-a716-446655440001',
        email: 'owner@store.com',
        role: 'owner',
      },
    } as any;
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as any;

    await guardMiddleware(request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
