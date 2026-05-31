import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';

const prisma = createPrismaMock();
const pinata = {
  pin: { delete: mock() },
  groups: { list: mock(), create: mock() },
};
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/config/pinata', () => ({ pinata }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/utils/logger.js', () => ({ logger }));

describe('Feature: Pinata file cleanup and user group provisioning', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    pinata.pin.delete.mockReset();
    pinata.groups.list.mockReset();
    pinata.groups.create.mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
  });

  test('given a pinned IPFS hash, when Pinata deletion succeeds, then cleanup is reported as successful', async () => {
    const { PinataCleanupService } = await import('../../../../src/modules/pinata/pinata.service');
    pinata.pin.delete.mockResolvedValue(undefined);

    const result = await PinataCleanupService.unpin('QmHash');

    expect(pinata.pin.delete).toHaveBeenCalledWith('QmHash');
    expect(result).toEqual({ success: true, ipfsHash: 'QmHash', message: 'Unpinned successfully' });
  });

  test('given an IPFS hash already removed from Pinata, when cleanup receives a 404, then cleanup is still treated as successful', async () => {
    const { PinataCleanupService } = await import('../../../../src/modules/pinata/pinata.service');
    pinata.pin.delete.mockRejectedValue({ status: 404, message: 'not found' });

    const result = await PinataCleanupService.unpin('QmGone');

    expect(result).toEqual({ success: true, ipfsHash: 'QmGone', message: 'Already deleted' });
  });

  test('given Pinata deletion fails unexpectedly, when cleanup runs, then a non-blocking failure result is returned', async () => {
    const { PinataCleanupService } = await import('../../../../src/modules/pinata/pinata.service');
    pinata.pin.delete.mockRejectedValue(new Error('pinata down'));

    const result = await PinataCleanupService.unpin('QmHash');

    expect(result).toEqual({ success: false, ipfsHash: 'QmHash', error: 'pinata down' });
  });

  test('given a user already has a Pinata group in the database, when group provisioning runs, then the stored group is reused without Pinata calls', async () => {
    const { createUserPinGroup } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: 'group-db' });

    const result = await createUserPinGroup('user-1', 'alice');

    expect(result).toBe('group-db');
    expect(pinata.groups.list).not.toHaveBeenCalled();
    expect(pinata.groups.create).not.toHaveBeenCalled();
  });

  test('given Pinata already has a matching group, when group provisioning runs, then the group is re-associated to the user', async () => {
    const { createUserPinGroup } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: null });
    pinata.groups.list.mockResolvedValue({ groups: [{ id: 'group-existing' }] });
    prisma.user.update.mockResolvedValue({});

    const result = await createUserPinGroup('user-1', 'alice');

    expect(result).toBe('group-existing');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pinataGroupId: 'group-existing' },
    });
  });

  test('given no stored or existing Pinata group, when group provisioning runs, then a new group is created and saved', async () => {
    const { createUserPinGroup } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: null });
    pinata.groups.list.mockResolvedValue({ groups: [] });
    pinata.groups.create.mockResolvedValue({ id: 'group-new' });
    prisma.user.update.mockResolvedValue({});

    const result = await createUserPinGroup('user-1', 'alice');

    expect(result).toBe('group-new');
    expect(pinata.groups.create).toHaveBeenCalledWith({
      name: 'user-user-1-alice',
      groupPinPolicy: { regions: [{ desiredRegions: ['us-east-1'], minReplicationCount: 1 }] },
    });
  });

  test('given Pinata group provisioning fails, when registration continues, then null is returned instead of throwing', async () => {
    const { createUserPinGroup } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockRejectedValue(new Error('db down'));

    const result = await createUserPinGroup('user-1', 'alice');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});
