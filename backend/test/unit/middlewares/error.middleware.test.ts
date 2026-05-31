import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createMockNext, createMockResponse } from '../../helpers/http';

const logger = { error: mock(), warn: mock(), info: mock(), debug: mock() };

mock.module('../../../src/utils/logger', () => ({ logger }));

describe('Feature: global error and not-found handling', () => {
  beforeEach(() => {
    Object.values(logger).forEach(fn => fn.mockReset());
    delete process.env.NODE_ENV;
  });

  test('given a request does not match any route, when not-found handling runs, then a consistent 404 response is returned', async () => {
    const { notFoundMiddleware } = await import('../../../src/middlewares/error.middleware');
    const req: any = { method: 'GET', path: '/api/missing' };
    const res = createMockResponse();

    notFoundMiddleware(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Route GET /api/missing not found' });
  });

  test('given an unhandled error in production mode, when error handling runs, then the stack details are hidden', async () => {
    const { errorMiddleware } = await import('../../../src/middlewares/error.middleware');
    process.env.NODE_ENV = 'production';
    const res = createMockResponse();
    const next = createMockNext();

    errorMiddleware(new Error('database exploded'), {} as any, res, next);

    expect(logger.error).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error' });
    expect(next).not.toHaveBeenCalled();
  });

  test('given an unhandled error in development mode, when error handling runs, then the error message is exposed for debugging', async () => {
    const { errorMiddleware } = await import('../../../src/middlewares/error.middleware');
    process.env.NODE_ENV = 'development';
    const res = createMockResponse();
    const next = createMockNext();

    errorMiddleware(new Error('debug detail'), {} as any, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal server error', error: 'debug detail' });
    expect(next).not.toHaveBeenCalled();
  });
});
