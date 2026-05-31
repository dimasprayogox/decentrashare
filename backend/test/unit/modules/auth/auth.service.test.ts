import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';
import { userFactory } from '../../../helpers/factories';

const prisma = createPrismaMock();
const verifyMetamaskSignature = mock();
const jwtSign = mock();
const jwtVerify = mock();
const randomBytes = mock();
const pinata = {
  groups: { list: mock(), create: mock() },
  pin: { delete: mock() },
};
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/utils/web3', () => ({ verifyMetamaskSignature }));
mock.module('../../../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));
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
    pinata.groups.list.mockReset();
    pinata.groups.create.mockReset();
    pinata.pin.delete.mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
    randomBytes.mockReturnValue({ toString: () => 'random-nonce' });
    jwtSign.mockImplementation((payload: any) => `${payload.type}-token`);
    pinata.groups.list.mockResolvedValue({ groups: [] });
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
        isRegistered: false,
      },
    });
    expect(result).toEqual({
      nonce: 'nonce-1',
      loginMessage: 'Sign this message to authenticate.\nNonce: nonce-1',
      registerMessage: 'Sign this message to register.\nNonce: nonce-1',
    });
  });

  test('given a wallet without a nonce record, when login is attempted, then authentication is rejected', async () => {
    const { loginWithWallet } = await import('../../../../src/modules/auth/auth.service');
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(loginWithWallet('0xabc', 'sig')).rejects.toThrow('Wallet not found. Please request nonce first.');
  });

  test('given an unregistered wallet, when login is attempted, then the user is asked to register first', async () => {
    const { loginWithWallet } = await import('../../../../src/modules/auth/auth.service');
    prisma.user.findUnique.mockResolvedValue(userFactory({ isRegistered: false }));

    await expect(loginWithWallet('0xabc', 'sig')).rejects.toThrow('Wallet not registered. Please register first.');
  });

  test('given a registered wallet and invalid signature, when login is attempted, then authentication is rejected and logged', async () => {
    const { loginWithWallet } = await import('../../../../src/modules/auth/auth.service');
    prisma.user.findUnique.mockResolvedValue(userFactory());
    verifyMetamaskSignature.mockReturnValue(false);

    await expect(loginWithWallet('0xabc', 'bad-sig')).rejects.toThrow('Invalid signature. Please try signing again.');
    expect(logger.warn).toHaveBeenCalled();
  });

  test('given a registered wallet and valid signature, when login succeeds, then access tokens are issued and the nonce is rotated', async () => {
    const { loginWithWallet } = await import('../../../../src/modules/auth/auth.service');
    const user = userFactory({ walletAddress: '0xabc', nonce: 'nonce-1' });
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.user.update.mockResolvedValue({ ...user, nonce: 'random-nonce' });
    verifyMetamaskSignature.mockReturnValue(true);

    const result = await loginWithWallet('0xABC', 'sig');

    expect(verifyMetamaskSignature).toHaveBeenCalledWith('0xabc', 'sig', 'Sign this message to authenticate.\nNonce: nonce-1');
    expect(jwtSign).toHaveBeenCalledTimes(2);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { walletAddress: '0xabc' },
      data: {
        nonce: 'random-nonce',
        nonceExpiresAt: expect.any(Date),
        refreshToken: 'refresh-token',
      },
    });
    expect(result.token).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
  });

  test('given invalid registration profile data, when registration is attempted, then validation errors are returned', async () => {
    const { registerUser } = await import('../../../../src/modules/auth/auth.service');

    await expect(registerUser('0xabc', 'sig', { username: 'ab', email: 'a@b.com' })).rejects.toThrow('Username must be 3-20 characters');
    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: 'bad' })).rejects.toThrow('Please enter a valid email address');
  });

  test('given a username already owned by another account, when registration is attempted, then registration is rejected', async () => {
    const { registerUser } = await import('../../../../src/modules/auth/auth.service');
    prisma.user.findUnique.mockResolvedValue(userFactory({ isRegistered: false }));
    verifyMetamaskSignature.mockReturnValue(true);
    prisma.user.findFirst.mockResolvedValueOnce(userFactory({ id: 'other' }));

    await expect(registerUser('0xabc', 'sig', { username: 'alice', email: 'alice@example.com' })).rejects.toThrow('Username is already taken. Please choose another one.');
  });

  test('given a valid wallet registration, when registration succeeds, then profile data is saved, tokens are issued, and Pinata setup starts', async () => {
    const { registerUser } = await import('../../../../src/modules/auth/auth.service');
    const pendingUser = userFactory({ isRegistered: false, nonce: 'nonce-1' });
    const updatedUser = userFactory({ username: 'alice', email: 'alice@example.com', isRegistered: true });
    prisma.user.findUnique.mockResolvedValue(pendingUser);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue(updatedUser);
    verifyMetamaskSignature.mockReturnValue(true);

    const result = await registerUser('0xABC', 'sig', { username: ' alice ', email: 'ALICE@example.com' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { walletAddress: '0xabc' },
      data: expect.objectContaining({
        username: 'alice',
        email: 'alice@example.com',
        isRegistered: true,
        refreshToken: 'refresh-token',
      }),
    });
    expect(pinata.groups.create).toHaveBeenCalledWith({
      name: `user-${updatedUser.id}-${updatedUser.username}`,
      groupPinPolicy: { regions: [{ desiredRegions: ['us-east-1'], minReplicationCount: 1 }] },
    });
    expect(result).toEqual({
      user: updatedUser,
      token: 'access-token',
      refreshToken: 'refresh-token',
      pinataSetup: 'in_progress',
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
    expect(result).toEqual({ token: 'new-access', refreshToken: 'new-refresh', user });
  });

  test('given an active session, when the user logs out, then the stored refresh token is cleared', async () => {
    const { logout } = await import('../../../../src/modules/auth/auth.service');

    await logout('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { refreshToken: null } });
  });
});
