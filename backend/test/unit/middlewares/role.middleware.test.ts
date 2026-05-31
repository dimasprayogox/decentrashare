import { describe, expect, test } from 'bun:test';
import { requireAdmin } from '../../../src/middlewares/role.middleware';
import { createMockNext, createMockResponse } from '../../helpers/http';

describe('Feature: admin-only route protection', () => {
  test('given no authenticated user, when an admin route is accessed, then the request is rejected as unauthorized', () => {
    const req: any = {};
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  test('given an authenticated non-admin user, when an admin route is accessed, then the request is rejected as forbidden', () => {
    const req: any = { user: { role: 'USER' } };
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Forbidden. Admin access only.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('given an authenticated admin user, when an admin route is accessed, then the request is allowed to continue', () => {
    const req: any = { user: { role: 'ADMIN' } };
    const res = createMockResponse();
    const next = createMockNext();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
