import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../../../helpers/prisma';

const prisma = createPrismaMock();
const pinata = {
  pin: { delete: mock() },
  groups: { list: mock(), create: mock() },
  upload: { file: mock() },
  pins: { list: mock() },
};
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

mock.module('../../../../src/config/db', () => ({ prisma }));
mock.module('../../../../src/config/pinata', () => ({ pinata }));
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/utils/logger.js', () => ({ logger }));

const mockFs = {
  mkdir: mock(),
  writeFile: mock(),
};
mock.module('fs/promises', () => mockFs);

describe('Feature: Pinata file cleanup and user group provisioning', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    pinata.pin.delete.mockReset();
    pinata.groups.list.mockReset();
    pinata.groups.create.mockReset();
    pinata.upload.file.mockReset();
    pinata.pins.list.mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
    mockFs.mkdir.mockReset();
    mockFs.writeFile.mockReset();
  });

  // --- PinataCleanupService.unpin ---

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

  // --- PinataCleanupService.archiveMetadata ---

  test('given document metadata, when archiveMetadata is called, then it writes JSON backup to local file', async () => {
    const { PinataCleanupService } = await import('../../../../src/modules/pinata/pinata.service');
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    const doc = {
      id: 'doc-1',
      ipfsHash: 'QmHash',
      fileName: 'report.pdf',
      ownerId: 'user-1',
      fileHash: 'hash-123',
      createdAt: new Date(),
    };

    const result = await PinataCleanupService.archiveMetadata(doc);

    expect(result).toBe(true);
    expect(mockFs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(mockFs.writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  });

  test('given file write fails, when archiveMetadata is called, then error is logged and returns false', async () => {
    const { PinataCleanupService } = await import('../../../../src/modules/pinata/pinata.service');
    mockFs.mkdir.mockRejectedValue(new Error('write permission denied'));

    const doc = {
      id: 'doc-1',
      ipfsHash: 'QmHash',
      fileName: 'report.pdf',
      ownerId: 'user-1',
      fileHash: 'hash-123',
      createdAt: new Date(),
    };

    const result = await PinataCleanupService.archiveMetadata(doc);

    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  // --- createUserPinGroup ---

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

  // --- ensureUserPinGroup ---

  test('given user already has group in DB, when ensureUserPinGroup runs, then it returns group ID without API calls', async () => {
    const { ensureUserPinGroup } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: 'db-group' });

    const result = await ensureUserPinGroup('user-1', 'alice');

    expect(result).toBe('db-group');
    expect(pinata.groups.list).not.toHaveBeenCalled();
  });

  test('given group exists on Pinata but not in DB, when ensureUserPinGroup runs, then it links group in DB', async () => {
    const { ensureUserPinGroup } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: null });
    pinata.groups.list.mockResolvedValue({ groups: [{ id: 'existing-pinata-group' }] });
    prisma.user.update.mockResolvedValue({});

    const result = await ensureUserPinGroup('user-1', 'alice');

    expect(result).toBe('existing-pinata-group');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pinataGroupId: 'existing-pinata-group' },
    });
  });

  test('given ensureUserPinGroup API fails, when ensureUserPinGroup runs, then it logs error and returns null', async () => {
    const { ensureUserPinGroup } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockRejectedValue(new Error('db timeout'));

    const result = await ensureUserPinGroup('user-1', 'alice');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  // --- uploadFileWithUserContext ---

  test('given file content, when uploadFileWithUserContext runs, then uploads to Pinata and returns result', async () => {
    const { uploadFileWithUserContext } = await import('../../../../src/modules/pinata/pinata.service');
    prisma.user.findUnique.mockResolvedValue({ username: 'alice', pinataGroupId: 'group-1' });
    pinata.upload.file.mockResolvedValue({ IpfsHash: 'QmUploadedCID' });

    const buffer = Buffer.from('file-data');
    const result = await uploadFileWithUserContext(buffer, 'test.txt', 'text/plain', 'user-1', {
      folderPath: 'docs/nested',
    });

    expect(result).toEqual({
      ipfsHash: 'QmUploadedCID',
      pinataUrl: 'https://gateway.pinata.cloud/ipfs/QmUploadedCID',
      metadata: expect.objectContaining({
        name: 'test.txt',
        keyvalues: expect.objectContaining({
          userId: 'user-1',
          originalName: 'test.txt',
          folderPath: 'docs/nested',
        }),
      }),
      groupId: 'group-1',
    });
  });

  // --- getUserPinsFromPinata ---

  test('given a user ID, when getUserPinsFromPinata runs, then lists user pins from Pinata and maps result', async () => {
    const { getUserPinsFromPinata } = await import('../../../../src/modules/pinata/pinata.service');
    pinata.pins.list.mockResolvedValue({
      results: [
        {
          ipfs_pin_hash: 'QmHash123',
          metadata: { name: 'file.txt', keyvalues: { userId: 'user-1' } },
          date_pinned: '2026-06-04T12:00:00Z',
          size: 100,
        },
      ],
    });

    const result = await getUserPinsFromPinata('user-1');

    expect(result).toEqual([
      {
        ipfsHash: 'QmHash123',
        name: 'file.txt',
        uploadedAt: '2026-06-04T12:00:00Z',
        size: 100,
        metadata: { userId: 'user-1' },
      },
    ]);
    expect(pinata.pins.list).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        keyvalues: {
          userId: { value: 'user-1', op: 'eq' },
        },
      },
    }));
  });

  test('given Pinata listing fails, when getUserPinsFromPinata runs, then error is logged and returns empty array', async () => {
    const { getUserPinsFromPinata } = await import('../../../../src/modules/pinata/pinata.service');
    pinata.pins.list.mockRejectedValue(new Error('Rate limit exceeded'));

    const result = await getUserPinsFromPinata('user-1');

    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});
