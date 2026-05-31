import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createMockNext, createMockResponse } from '../../helpers/http';

const jwtVerify = mock();
const loggerError = mock();

mock.module('jsonwebtoken', () => ({
  default: { verify: jwtVerify },
}));

mock.module('../../../src/utils/logger', () => ({
  logger: {
    error: loggerError,
    warn: mock(),
    info: mock(),
    debug: mock(),
  },
}));

describe('Feature: authenticated API access', () => {
  beforeEach(() => {
    jwtVerify.mockReset();
    loggerError.mockReset();
  });

  test('given no bearer token, when an authenticated endpoint is accessed, then the request is rejected as unauthorized', async () => {
    const { authMiddleware } = await import('../../../src/middlewares/auth.middleware');
    const req: any = { headers: {}, ip: '127.0.0.1' };
    const res = createMockResponse();
    const next = createMockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Access token is required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('given a valid bearer token, when an authenticated endpoint is accessed, then the decoded user is attached and the request continues', async () => {
    const { authMiddleware } = await import('../../../src/middlewares/auth.middleware');
    jwtVerify.mockReturnValue({ userId: 'user-1', walletAddress: '0xabc', role: 'ADMIN', type: 'access' });
    const req: any = { headers: { authorization: 'Bearer token-1' }, ip: '127.0.0.1' };
    const res = createMockResponse();
    const next = createMockNext();

    await authMiddleware(req, res, next);

    expect(jwtVerify).toHaveBeenCalledWith('token-1', expect.any(String));
    expect(req.user).toEqual({ userId: 'user-1', walletAddress: '0xabc', role: 'ADMIN' });
    expect(next).toHaveBeenCalled();
  });

  test('given a valid token without a role claim, when authentication succeeds, then the user role defaults to USER', async () => {
    const { authMiddleware } = await import('../../../src/middlewares/auth.middleware');
    jwtVerify.mockReturnValue({ userId: 'user-1', walletAddress: '0xabc', type: 'access' });
    const req: any = { headers: { authorization: 'Bearer token-1' }, ip: '127.0.0.1' };
    const res = createMockResponse();
    const next = createMockNext();

    await authMiddleware(req, res, next);

    expect(req.user.role).toBe('USER');
    expect(next).toHaveBeenCalled();
  });

  test('given an expired bearer token, when an authenticated endpoint is accessed, then a token-expired response is returned', async () => {
    const { authMiddleware } = await import('../../../src/middlewares/auth.middleware');
    const error: any = new Error('jwt expired');
    error.name = 'TokenExpiredError';
    jwtVerify.mockImplementation(() => { throw error; });
    const req: any = { headers: { authorization: 'Bearer expired' }, ip: '127.0.0.1' };
    const res = createMockResponse();
    const next = createMockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Token expired. Please refresh your token.',
      code: 'TOKEN_EXPIRED',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('given a malformed bearer token, when an authenticated endpoint is accessed, then an invalid-token response is returned', async () => {
    const { authMiddleware } = await import('../../../src/middlewares/auth.middleware');
    jwtVerify.mockImplementation(() => { throw new Error('invalid signature'); });
    const req: any = { headers: { authorization: 'Bearer bad' }, ip: '127.0.0.1' };
    const res = createMockResponse();
    const next = createMockNext();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid access token.',
      code: 'INVALID_TOKEN',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
