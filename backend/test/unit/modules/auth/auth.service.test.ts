import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';
import { userFactory } from '../../../helpers/factories';

const prisma = createPrismaMock();

const verifyMetamaskSignature = mock();
const jwtSign = mock();
const jwtVerify = mock();
const randomBytes = mock();
const pinata = {
  unpin: mock(),
  pin: { delete: mock() },
  groups: { list: mock(), create: mock() },
  upload: { file: mock() },
  pins: { list: mock() },
};
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/utils/web3', () => ({ verifyMetamaskSignature }));

mock.module('jsonwebtoken', () => ({
  default: { sign: jwtSign, verify: jwtVerify },
}));
mock.module('crypto', () => ({
  default: { randomBytes },
}));
mock.module('../../../../src/utils/logger.js', () => ({ logger }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/config/pinata', () => ({ pinata }));

describe('Feature: wallet authentication and session lifecycle', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    verifyMetamaskSignature.mockReset();
    jwtSign.mockReset();
    jwtVerify.mockReset();
    randomBytes.mockReset();
    pinata.unpin.mockReset();
    pinata.groups.list.mockReset();
    pinata.groups.create.mockReset();
    pinata.pin.delete.mockReset();
    pinata.upload.file.mockReset();
    pinata.pins.list.mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
    randomBytes.mockReturnValue({ toString: () => 'random-nonce' });

    jwtSign.mockImplementation((payload: any) => `${payload.type}-token`);
    const defaultListBuilder: any = {
      name: () => defaultListBuilder,
      limit: () => defaultListBuilder,
      then: (cb: (v: any[]) => any) => Promise.resolve([]).then(cb),
    };
    pinata.groups.list.mockReturnValue(defaultListBuilder);
    pinata.groups.create.mockResolvedValue({ id: 'group-1' });
  });

  test('given a wallet address, when a nonce is requested, then the wallet is normalized and login/register signing messages are returned', async () => {
    const { getNonce } = await import('../../../../src/modules/auth/auth.service');
    prisma.user.upsert.mockResolvedValue(userFactory({ nonce: 'nonce-1' }));

    const result = await getNonce('0xABC');

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { walletAddress: '0xabc' },
      update: { nonce: 'random-nonce', nonceExpiresAt: expect.any(Date) },
      create: {
        walletAddress: '0xabc',
        nonce: 'random-nonce',
        nonceExpiresAt: expect.any(Date),
      },
    });
    expect(result).toEqual({
      nonce: 'nonce-1',
      loginMessage: 'Sign this message to authenticate.\nNonce: nonce-1',
      registerMessage: 'Sign this message to register.\nNonce: nonce-1',
    });
  });





  test('given a refresh token that does not match the stored session, when token refresh is attempted, then the session is rejected', async () => {
    const { refreshAccessToken } = await import('../../../../src/modules/auth/auth.service');
    jwtVerify.mockReturnValue({ userId: 'user-1', type: 'refresh' });
    prisma.user.findUnique.mockResolvedValue(userFactory({ refreshToken: 'different' }));

    await expect(refreshAccessToken('old-refresh')).rejects.toThrow('Invalid or expired refresh token. Please login again.');
  });

  test('given a valid refresh token, when access is refreshed, then a new access token and refresh token are issued', async () => {
    const { refreshAccessToken } = await import('../../../../src/modules/auth/auth.service');
    const user = userFactory({ refreshToken: 'old-refresh' });
    jwtVerify.mockReturnValue({ userId: user.id, type: 'refresh' });
    prisma.user.findUnique.mockResolvedValue(user);
    jwtSign.mockImplementationOnce(() => 'new-access').mockImplementationOnce(() => 'new-refresh');

    const result = await refreshAccessToken('old-refresh');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { refreshToken: 'new-refresh' } });
    expect(result).toEqual({ token: 'new-access', refreshToken: 'new-refresh', user: { ...user, nonce: undefined, refreshToken: undefined } });
  });

  test('given an active session, when the user logs out, then the stored refresh token is cleared', async () => {
    const { logout } = await import('../../../../src/modules/auth/auth.service');

    await logout('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { refreshToken: null } });
  });
});
