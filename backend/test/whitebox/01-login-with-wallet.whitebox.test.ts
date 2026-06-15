import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../helpers/prisma';
import { userFactory } from '../helpers/factories';

const prisma = createPrismaMock();
const verifyMetamaskSignature = mock();
const jwtSign = mock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../src/config/db', () => ({ prisma }));
mock.module('../../src/utils/web3', () => ({ verifyMetamaskSignature }));

mock.module('jsonwebtoken', () => ({
  default: { sign: jwtSign, verify: mock() },
}));
mock.module('../../src/utils/logger.js', () => ({ logger }));
mock.module('../../src/utils/logger', () => ({ logger }));

describe('auth.service.ts - loginWithWallet() Whitebox Testing', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    verifyMetamaskSignature.mockReset();
    jwtSign.mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
    jwtSign.mockImplementation((payload: any) => `${payload.type}-token`);
  });

  test('Jalur Gagal: wallet tanpa nonce', async () => {
    const { loginWithWallet } = await import('../../src/modules/auth/auth.service?cache-bust=01');
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(loginWithWallet('0xabc', 'sig')).rejects.toThrow('Wallet not found. Please request nonce first.');
  });

  test('Jalur Gagal: wallet belum terdaftar', async () => {
    const { loginWithWallet } = await import('../../src/modules/auth/auth.service?cache-bust=01');
    prisma.user.findUnique.mockResolvedValue(userFactory({ username: null, email: null }));

    await expect(loginWithWallet('0xabc', 'sig')).rejects.toThrow('Wallet not registered. Please register first.');
  });

  test('Jalur Gagal: signature tidak valid', async () => {
    const { loginWithWallet } = await import('../../src/modules/auth/auth.service?cache-bust=01');
    prisma.user.findUnique.mockResolvedValue(userFactory());
    verifyMetamaskSignature.mockReturnValue(false);

    await expect(loginWithWallet('0xabc', 'bad-sig')).rejects.toThrow('Invalid signature. Please try signing again.');
    expect(logger.warn).toHaveBeenCalled();
  });

  test('Jalur Sukses: wallet terdaftar dan signature valid', async () => {
    const { loginWithWallet } = await import('../../src/modules/auth/auth.service?cache-bust=01');
    const user = userFactory({ walletAddress: '0xabc', nonce: 'nonce-1', nonceExpiresAt: new Date(Date.now() + 50000) });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, nonce: 'random-nonce' });
    verifyMetamaskSignature.mockReturnValue(true);

    const result = await loginWithWallet('0xABC', 'sig');

    expect(verifyMetamaskSignature).toHaveBeenCalledWith('0xabc', 'sig', 'Sign this message to authenticate.\nNonce: nonce-1');
    expect(jwtSign).toHaveBeenCalledTimes(2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { walletAddress: '0xabc' },
      data: {
        nonce: expect.any(String),
        nonceExpiresAt: expect.any(Date),
        refreshToken: 'refresh-token',
      },
    });
    expect(result.token).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
  });

  test('Jalur Gagal: nonce expired', async () => {
    const { loginWithWallet } = await import('../../src/modules/auth/auth.service?cache-bust=01');
    const user = userFactory({ walletAddress: '0xabc', nonceExpiresAt: new Date(Date.now() - 5000) });
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(loginWithWallet('0xabc', 'sig')).rejects.toThrow('Authentication nonce expired. Please request a new nonce.');
  });
});
