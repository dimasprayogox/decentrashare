import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../helpers/prisma';
import { userFactory } from '../helpers/factories';

const prisma = createPrismaMock();
const verifyMetamaskSignature = mock();
const jwtSign = mock();
const pinata = {
  unpin: mock(),
  pin: { delete: mock() },
  groups: { list: mock(), create: mock() },
  upload: { file: mock() },
  pins: { list: mock() },
};
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../src/config/db', () => ({ prisma }));
mock.module('../../src/utils/web3', () => ({ verifyMetamaskSignature }));

mock.module('jsonwebtoken', () => ({
  default: { sign: jwtSign, verify: mock() },
}));
mock.module('../../src/utils/logger.js', () => ({ logger }));
mock.module('../../src/utils/logger', () => ({ logger }));
mock.module('../../src/config/pinata', () => ({ pinata }));

describe('auth.service.ts - registerUser() Whitebox Testing', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    verifyMetamaskSignature.mockReset();
    jwtSign.mockReset();
    pinata.groups.list.mockReset();
    pinata.groups.create.mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
    jwtSign.mockImplementation((payload: any) => `${payload.type}-token`);

    const defaultListBuilder: any = {
      name: () => defaultListBuilder,
      limit: () => defaultListBuilder,
      then: (cb: (v: any[]) => any) => Promise.resolve([]).then(cb),
    };
    pinata.groups.list.mockReturnValue(defaultListBuilder);
    pinata.groups.create.mockResolvedValue({ id: 'group-1' });
  });

  test('Jalur Gagal: data profil tidak valid', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');

    await expect(registerUser('0xabc', 'sig', { username: '', email: 'a@b.com' })).rejects.toThrow('Username is required');
    await expect(registerUser('0xabc', 'sig', { username: 'ab', email: 'a@b.com' })).rejects.toThrow('Username must be 3-20 characters');
    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: '' })).rejects.toThrow('Email is required');
    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: 'bad' })).rejects.toThrow('Please enter a valid email address');
  });

  test('Jalur Gagal: signature tidak valid', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    prisma.user.findUnique.mockResolvedValue(userFactory({ username: null, email: null, nonceExpiresAt: new Date(Date.now() + 50000) }));
    verifyMetamaskSignature.mockReturnValue(false);

    await expect(registerUser('0xabc', 'bad-sig', { username: 'alice', email: 'alice@example.com' })).rejects.toThrow('Invalid signature. Please try signing again.');
    expect(logger.warn).toHaveBeenCalled();
  });

  test('Jalur Gagal: wallet sudah terdaftar', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    prisma.user.findUnique.mockResolvedValue(userFactory({ username: 'alice', email: 'alice@example.com' }));

    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: 'alice@example.com' })).rejects.toThrow('This wallet is already registered. Please login instead.');
  });

  test('Jalur Gagal: nonce expired', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    prisma.user.findUnique.mockResolvedValue(userFactory({ username: null, email: null, nonceExpiresAt: new Date(Date.now() - 5000) }));

    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: 'alice@example.com' })).rejects.toThrow('Authentication nonce expired. Please request a new nonce.');
  });

  test('Jalur Gagal: username sudah dipakai', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    prisma.user.findUnique.mockResolvedValue(userFactory({ username: null, email: null, nonceExpiresAt: new Date(Date.now() + 50000) }));
    verifyMetamaskSignature.mockReturnValue(true);
    prisma.user.findFirst.mockResolvedValueOnce(userFactory({ id: 'other' }));

    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: 'alice@example.com' })).rejects.toThrow('Username is already taken. Please choose another one.');
  });

  test('Jalur Gagal: email sudah dipakai', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    prisma.user.findUnique.mockResolvedValue(userFactory({ username: null, email: null, nonceExpiresAt: new Date(Date.now() + 50000) }));
    verifyMetamaskSignature.mockReturnValue(true);
    prisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(userFactory({ id: 'other' }));

    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: 'alice@example.com' })).rejects.toThrow('Email is already registered. Please use another email.');
  });

  test('Jalur Sukses: registrasi berhasil', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    const pendingUser = userFactory({ username: null, email: null, nonce: 'nonce-1' });
    const updatedUser = userFactory({ username: 'alice', email: 'alice@example.com' });
    prisma.user.findUnique.mockResolvedValue(pendingUser);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(updatedUser);
    verifyMetamaskSignature.mockReturnValue(true);

    const result = await registerUser('0xABC', 'sig', { username: ' alice ', email: 'ALICE@example.com' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { walletAddress: '0xabc' },
      data: expect.objectContaining({
        username: 'alice',
        email: 'alice@example.com',
        refreshToken: 'refresh-token',
      }),
    });
    expect(pinata.groups.create).toHaveBeenCalledWith({
      name: `user-${updatedUser.id}-${updatedUser.username}`,
    });
    expect(result).toEqual({
      user: { ...updatedUser, nonce: undefined, refreshToken: undefined },
      token: 'access-token',
      refreshToken: 'refresh-token',
      pinataSetup: 'ready',
    });
  });

  test('Jalur Sukses: Pinata group creation gagal tetapi registrasi tetap selesai', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    const pendingUser = userFactory({ username: null, email: null, nonce: 'nonce-1' });
    const updatedUser = userFactory({ username: 'alice', email: 'alice@example.com' });
    prisma.user.findUnique.mockResolvedValue(pendingUser);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(updatedUser);
    verifyMetamaskSignature.mockReturnValue(true);
    
    const listBuilder: any = {
      name: () => listBuilder,
      limit: () => listBuilder,
      then: (cb: any, reject: any) => Promise.reject(new Error('List failed')).catch(reject),
    };
    pinata.groups.list.mockReturnValue(listBuilder);
    pinata.groups.create.mockRejectedValue(new Error('Create failed'));

    const result = await registerUser('0xABC', 'sig', { username: 'alice', email: 'alice@example.com' });

    expect(result.pinataSetup).toBe('pending');
    expect(logger.warn).toHaveBeenCalledWith(
      `⚠️ Pinata group not created for user ${updatedUser.id} (will retry on first upload)`
    );
  });

  test('Jalur Sukses: Pinata group creation throw error dan ditangani', async () => {
    const { registerUser } = await import('../../src/modules/auth/auth.service?cache-bust=02');
    const pendingUser = userFactory({ username: null, email: null, nonce: 'nonce-1' });
    const updatedUser = userFactory({ username: 'alice', email: 'alice@example.com' });
    
    prisma.user.findUnique
      .mockResolvedValueOnce(pendingUser)
      .mockRejectedValueOnce(new Error('DB failure inside createUserPinGroup'));
      
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(updatedUser);
    verifyMetamaskSignature.mockReturnValue(true);
    
    logger.warn.mockImplementationOnce(() => {
      throw new Error('Forced propagation exception');
    });

    const result = await registerUser('0xABC', 'sig', { username: 'alice', email: 'alice@example.com' });

    expect(result.pinataSetup).toBe('pending');
    expect(logger.error).toHaveBeenCalledWith(
      `❌ Pinata group creation failed for user ${updatedUser.id}`,
      expect.objectContaining({ error: 'Forced propagation exception' })
    );
  });
});
