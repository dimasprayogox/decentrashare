import { beforeEach, describe, expect, mock, test, spyOn } from 'bun:test';
import { createPrismaMock, resetPrismaMock } from '../helpers/prisma';
import { documentFactory } from '../helpers/factories';
import blockchainService from '../../src/modules/blockchain/blockchain.service';
import realFs from 'node:fs';

const prisma = createPrismaMock();
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };
const pinata = {
  unpin: mock(),
  pin: { delete: mock() },
  groups: { list: mock(), create: mock() },
  upload: { file: mock() },
  pins: { list: mock() },
};

spyOn(blockchainService, 'prepareTransactionData');

mock.module('../../src/config/db', () => ({ prisma }));
mock.module('../../src/utils/logger', () => ({ logger }));
mock.module('../../src/utils/logger.js', () => ({ logger }));
mock.module('../../src/config/pinata', () => ({ pinata }));
mock.module('../../src/utils/hash', () => ({ generateFileHash: mock(async () => 'hash-1') }));

const mockFsExistsSync = mock(() => true);
const mockFsUnlinkSync = mock();
const mockFsReadFileSync = mock(() => Buffer.from('file-content'));

mock.module('fs', () => ({
  ...realFs,
  default: {
    ...realFs,
    existsSync: mockFsExistsSync,
    unlinkSync: mockFsUnlinkSync,
    readFileSync: mockFsReadFileSync,
  },
  existsSync: mockFsExistsSync,
  unlinkSync: mockFsUnlinkSync,
  readFileSync: mockFsReadFileSync,
}));

describe('uploadMultipleFiles()', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    Object.values(logger).forEach(fn => fn.mockReset());
    pinata.upload.file.mockReset();
    blockchainService.prepareTransactionData.mockReset();
  });

  test('Path 1 (Valid): file valid berhasil diupload ke Pinata dan disimpan ke database', async () => {
    const { uploadMultipleFiles } = await import('../../src/modules/document/document.service?cache-bust=03');
    
    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: 'group-1', username: 'alice', storageLimit: 5368709120 });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
    prisma.document.findUnique.mockResolvedValue(null);
    prisma.document.findFirst.mockResolvedValue(null);
    pinata.upload.file.mockResolvedValue({ IpfsHash: 'QmNewDocCID' });
    blockchainService.prepareTransactionData.mockReturnValue({ hash: 'QmNewDocCID', name: 'report.pdf', fileHash: 'hash-1' });
    
    const mockCreatedDoc = documentFactory({ id: 'doc-new', title: 'report', ownerId: 'user-1', ipfsHash: 'QmNewDocCID', fileHash: 'hash-1' });
    prisma.$transaction.mockImplementation(async (cb) => {
      return cb(prisma);
    });
    prisma.document.create.mockResolvedValue(mockCreatedDoc);
    prisma.documentAccess.createMany.mockResolvedValue({ count: 1 });
    prisma.activityLog.create.mockResolvedValue({});

    const files = [
      {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/tmp/report.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'user-1');

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].status).toBe('uploaded');
    expect(result.results[0].pinataInfo?.ipfsHash).toBe('QmNewDocCID');
    expect(prisma.document.create).toHaveBeenCalled();
  });

  test('Path 2 (Tidak Valid): file dengan hash duplikat dilewati dan dilaporkan', async () => {
    const { uploadMultipleFiles } = await import('../../src/modules/document/document.service?cache-bust=03');

    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: null, storageLimit: 5368709120 });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 0 } });
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-existing',
      title: 'report',
      ipfsHash: 'QmExisting',
      fileHash: 'hash-1',
      createdAt: new Date(),
    });

    const files = [
      {
        originalname: 'report.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/tmp/report.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'user-1');

    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].status).toBe('duplicate');
    expect(result.results[0].errorCode).toBe('FILE_DUPLICATE');
    expect(pinata.upload.file).not.toHaveBeenCalled();
  });

  test('Path 3 (Tidak Valid): upload ditolak karena melebihi kuota penyimpanan user', async () => {
    const { uploadMultipleFiles } = await import('../../src/modules/document/document.service?cache-bust=03');

    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: null, username: 'alice', storageLimit: 1073741824 });
    prisma.document.aggregate.mockResolvedValue({ _sum: { fileSize: 1000000000 } });

    const files = [
      {
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 200000000,
        path: '/tmp/big.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'user-1');

    expect(result.summary).toEqual(expect.objectContaining({ uploaded: 0, error: 1 }));
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].errorCode).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(pinata.upload.file).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  test('Path 4 (Valid): quota check dilewati karena user memiliki kuota unlimited', async () => {
    const { uploadMultipleFiles } = await import('../../src/modules/document/document.service?cache-bust=03');

    prisma.user.findUnique.mockResolvedValue({ pinataGroupId: 'group-1', username: 'admin', storageLimit: null });
    prisma.document.findUnique.mockResolvedValue(null);
    pinata.upload.file.mockResolvedValue({ IpfsHash: 'QmAdminCID' });
    blockchainService.prepareTransactionData.mockReturnValue({ hash: 'QmAdminCID', name: 'big.pdf', fileHash: 'hash-1' });
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
    prisma.document.create.mockResolvedValue(documentFactory({ id: 'doc-admin', ipfsHash: 'QmAdminCID', fileHash: 'hash-1' }));
    prisma.documentAccess.createMany.mockResolvedValue({ count: 1 });
    prisma.activityLog.create.mockResolvedValue({});

    const aggregateSpy = prisma.document.aggregate;

    const files = [
      {
        originalname: 'big.pdf',
        mimetype: 'application/pdf',
        size: 999999999999,
        path: '/tmp/big.pdf',
      } as any,
    ];

    const result = await uploadMultipleFiles(files, 'admin-1');

    expect(result.results[0].errorCode).not.toBe('STORAGE_QUOTA_EXCEEDED');
    expect(aggregateSpy).not.toHaveBeenCalled();
  });
});
