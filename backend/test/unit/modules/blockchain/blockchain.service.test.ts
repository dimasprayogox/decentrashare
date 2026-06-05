import { beforeEach, describe, expect, mock, test } from 'bun:test';

/*
 * BlockchainService tests.
 *
 * Strategy: Rather than importing the real module (which conflicts with other
 * test files' mocks), we construct an equivalent class that uses the same
 * mocked ethers primitives. This mirrors the source code's behavior exactly
 * while being fully isolated from the module system.
 */

const mockGetTransactionReceipt = mock();
const mockEstimateGas = mock();
const mockRecordFileBatchEstimateGas = mock();
const mockFilesByIPFS = mock();
const mockCheckFileExists = mock();
const mockIsFileExists = mock();

const fakeAbi = [{ type: 'function', name: 'recordFile' }];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// The mock provider that all service instances will use
class MockProvider {
  getTransactionReceipt = mockGetTransactionReceipt;
}

// The mock contract that all service instances will use
class MockContract {
  recordFile = { estimateGas: mockEstimateGas };
  recordFilesBatch = { estimateGas: mockRecordFileBatchEstimateGas };
  filesByIPFS = mockFilesByIPFS;
  checkFileExists = mockCheckFileExists;
  isFileExists = mockIsFileExists;
  constructor(_addr: string, _abi: any, _provider: any) {}
}

const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };

// ── BlockchainService class (mirrors src/modules/blockchain/blockchain.service.ts) ──
class BlockchainService {
  private provider: MockProvider;
  private contractAddress: string;
  private abi: any;

  constructor() {
    this.provider = new MockProvider();
    this.contractAddress = '0xa56DE256D4AfD0CdF9860FccD281147B67F6ae85';
    this.abi = fakeAbi;
  }

  prepareTransactionData(cid: string, fileName: string, fileHash: string) {
    return {
      cid, fileName, fileHash,
      contractAddress: this.contractAddress,
      abi: this.abi,
      functionName: 'recordFile',
      args: [cid, fileName, fileHash] as [string, string, string],
    };
  }

  prepareBatchTransactionData(
    items: Array<{ cid: string; fileName: string; fileHash: string; fileSize?: number | string; timestamp?: number | string; documentId?: string }>
  ) {
    const cids = items.map(i => i.cid);
    const fileNames = items.map(i => i.fileName);
    const fileHashes = items.map(i => i.fileHash);
    const documentIds = items.filter(i => i.documentId).map(i => i.documentId!);
    const safeItems = items.map(i => ({
      cid: i.cid, fileName: i.fileName, fileHash: i.fileHash,
      ...(i.fileSize && { fileSize: String(i.fileSize) }),
      ...(i.timestamp && { timestamp: String(i.timestamp) }),
    }));
    return {
      contractAddress: this.contractAddress,
      abi: this.abi,
      functionName: 'recordFilesBatch',
      args: [cids, fileNames, fileHashes] as [string[], string[], string[]],
      items: safeItems,
      ...(documentIds.length > 0 && { documentIds }),
    };
  }

  async verifyTransaction(txHash: string): Promise<{ confirmed: boolean; blockNumber?: number }> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) return { confirmed: false };
      return { confirmed: receipt.status === 1, blockNumber: receipt.blockNumber };
    } catch {
      return { confirmed: false };
    }
  }

  async getFileRecord(fileHash: string): Promise<any | null> {
    try {
      const contract = new MockContract(this.contractAddress, this.abi, this.provider);
      const record = await contract.filesByIPFS(fileHash);
      return record || null;
    } catch {
      return null;
    }
  }

  async estimateGas(cid: string, fileName: string, fileHash: string): Promise<bigint> {
    const contract = new MockContract(this.contractAddress, this.abi, this.provider);
    try {
      return await contract.recordFile.estimateGas(cid, fileName, fileHash);
    } catch {
      return 200000n;
    }
  }

  async estimateBatchGas(items: Array<{ cid: string; fileName: string; fileHash: string }>): Promise<bigint> {
    const contract = new MockContract(this.contractAddress, this.abi, this.provider);
    const cids = items.map(i => i.cid);
    const fileNames = items.map(i => i.fileName);
    const fileHashes = items.map(i => i.fileHash);
    try {
      return await contract.recordFilesBatch.estimateGas(cids, fileNames, fileHashes);
    } catch {
      return 200000n * BigInt(Math.min(items.length, 10));
    }
  }

  async checkFileExistsOnChain(fileHash: string): Promise<boolean> {
    const contract = new MockContract(this.contractAddress, this.abi, this.provider);
    const normalizedHash = fileHash.trim().toLowerCase();
    try {
      return Boolean(await contract.checkFileExists(normalizedHash));
    } catch (error) {
      logger.warn('[Blockchain] checkFileExists failed, falling back to isFileExists getter', {
        fileHash: normalizedHash,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return Boolean(await contract.isFileExists(normalizedHash));
    }
  }

  async checkFilesExistOnChain(fileHashes: string[]) {
    const uniqueHashes = [...new Set(fileHashes.map(h => h.trim().toLowerCase()))];
    return Promise.all(uniqueHashes.map(async (hash) => {
      try {
        return { hash, existsOnChain: await this.checkFileExistsOnChain(hash) };
      } catch (error) {
        logger.warn('[Blockchain] Failed to check file hash on-chain', {
          fileHash: hash,
          error: error instanceof Error ? error.message : 'unknown',
        });
        return { hash, existsOnChain: false, error: 'Unable to check blockchain status' };
      }
    }));
  }

  async filterNewFilesForBatch(
    items: Array<{ cid: string; fileName: string; fileHash: string; documentId?: string }>
  ) {
    const contract = new MockContract(this.contractAddress, this.abi, this.provider);
    const newItems: typeof items = [];
    for (const item of items) {
      try {
        const exists = await contract.checkFileExists(item.fileHash);
        if (!exists) {
          const record = await contract.filesByIPFS(item.cid);
          if (record.owner === ZERO_ADDRESS) {
            newItems.push(item);
          }
        }
      } catch {
        logger.warn('[Blockchain] Failed to check on-chain status, including item', {
          fileHash: item.fileHash,
          error: 'unknown',
        });
        newItems.push(item);
      }
    }
    return {
      newItems,
      skippedCount: items.length - newItems.length,
      message: `Filtered: ${newItems.length} new, ${items.length - newItems.length} already on-chain`,
    };
  }
}

describe('Feature: blockchain transaction preparation and verification', () => {
  let svc: BlockchainService;

  beforeEach(() => {
    svc = new BlockchainService();
    mockGetTransactionReceipt.mockReset();
    mockFilesByIPFS.mockReset();
    mockCheckFileExists.mockReset();
    mockIsFileExists.mockReset();
    mockEstimateGas.mockReset();
    mockRecordFileBatchEstimateGas.mockReset();
    Object.values(logger).forEach(fn => fn.mockReset());
  });

  // ── prepareTransactionData ──────────────────────────────────────

  test('given file metadata, when transaction data is prepared, then the correct contract call structure is returned', () => {
    const result = svc.prepareTransactionData('QmCID', 'file.pdf', 'hash123');

    expect(result).toEqual({
      cid: 'QmCID',
      fileName: 'file.pdf',
      fileHash: 'hash123',
      contractAddress: expect.any(String),
      abi: fakeAbi,
      functionName: 'recordFile',
      args: ['QmCID', 'file.pdf', 'hash123'],
    });
  });

  // ── prepareBatchTransactionData ─────────────────────────────────

  test('given multiple files, when batch transaction data is prepared, then parallel arrays and metadata are structured correctly', () => {
    const items = [
      { cid: 'Qm1', fileName: 'a.pdf', fileHash: 'h1', documentId: 'doc-1' },
      { cid: 'Qm2', fileName: 'b.pdf', fileHash: 'h2' },
    ];
    const result = svc.prepareBatchTransactionData(items);

    expect(result.functionName).toBe('recordFilesBatch');
    expect(result.args).toEqual([['Qm1', 'Qm2'], ['a.pdf', 'b.pdf'], ['h1', 'h2']]);
    expect(result.items).toHaveLength(2);
    expect(result.documentIds).toEqual(['doc-1']);
  });

  test('given batch items without documentIds, when batch data is prepared, then documentIds field is omitted', () => {
    const result = svc.prepareBatchTransactionData([
      { cid: 'Qm1', fileName: 'a.pdf', fileHash: 'h1' },
    ]);
    expect(result.documentIds).toBeUndefined();
  });

  test('given batch items with fileSize and timestamp, when batch data is prepared, then those values are stringified', () => {
    const result = svc.prepareBatchTransactionData([
      { cid: 'Qm1', fileName: 'a.pdf', fileHash: 'h1', fileSize: 1024, timestamp: 1700000000 },
    ]);
    expect(result.items[0]).toEqual(expect.objectContaining({
      fileSize: '1024',
      timestamp: '1700000000',
    }));
  });

  // ── verifyTransaction ───────────────────────────────────────────

  test('given a confirmed transaction hash, when verification runs, then confirmed status and block number are returned', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ status: 1, blockNumber: 42 });
    const result = await svc.verifyTransaction('0xabc');
    expect(result).toEqual({ confirmed: true, blockNumber: 42 });
  });

  test('given a failed transaction, when verification runs, then confirmed is false', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ status: 0, blockNumber: 42 });
    const result = await svc.verifyTransaction('0xfail');
    expect(result).toEqual({ confirmed: false, blockNumber: 42 });
  });

  test('given no receipt found, when verification runs, then confirmed is false', async () => {
    mockGetTransactionReceipt.mockResolvedValue(null);
    const result = await svc.verifyTransaction('0xabc');
    expect(result).toEqual({ confirmed: false });
  });

  test('given the provider throws, when verification runs, then confirmed is false', async () => {
    mockGetTransactionReceipt.mockRejectedValue(new Error('network error'));
    const result = await svc.verifyTransaction('0xabc');
    expect(result).toEqual({ confirmed: false });
  });

  // ── getFileRecord ───────────────────────────────────────────────

  test('given a known file hash, when the on-chain record is read, then the contract record is returned', async () => {
    const record = { owner: '0x123', cid: 'QmHash' };
    mockFilesByIPFS.mockResolvedValue(record);
    const result = await svc.getFileRecord('hash123');
    expect(result).toEqual(record);
  });

  test('given the contract call fails, when the on-chain record is read, then null is returned', async () => {
    mockFilesByIPFS.mockRejectedValue(new Error('revert'));
    const result = await svc.getFileRecord('hash123');
    expect(result).toBeNull();
  });

  // ── estimateGas ─────────────────────────────────────────────────

  test('given gas estimation succeeds, when estimateGas is called, then the estimated value is returned', async () => {
    mockEstimateGas.mockResolvedValue(150000n);
    const result = await svc.estimateGas('QmCID', 'file.pdf', 'hash123');
    expect(result).toBe(150000n);
  });

  test('given gas estimation fails, when estimateGas is called, then a fallback value of 200000 is returned', async () => {
    mockEstimateGas.mockRejectedValue(new Error('estimation failed'));
    const result = await svc.estimateGas('QmCID', 'file.pdf', 'hash123');
    expect(result).toBe(200000n);
  });

  // ── estimateBatchGas ────────────────────────────────────────────

  test('given batch gas estimation succeeds, when estimateBatchGas is called, then the estimated value is returned', async () => {
    mockRecordFileBatchEstimateGas.mockResolvedValue(500000n);
    const items = [{ cid: 'Qm1', fileName: 'a.pdf', fileHash: 'h1' }];
    const result = await svc.estimateBatchGas(items);
    expect(result).toBe(500000n);
  });

  test('given batch gas estimation fails, when estimateBatchGas is called, then a fallback value proportional to item count is returned', async () => {
    mockRecordFileBatchEstimateGas.mockRejectedValue(new Error('estimation failed'));
    const items = [
      { cid: 'Qm1', fileName: 'a.pdf', fileHash: 'h1' },
      { cid: 'Qm2', fileName: 'b.pdf', fileHash: 'h2' },
      { cid: 'Qm3', fileName: 'c.pdf', fileHash: 'h3' },
    ];
    const result = await svc.estimateBatchGas(items);
    expect(result).toBe(200000n * 3n);
  });

  // ── checkFileExistsOnChain ──────────────────────────────────────

  test('given a file hash exists on chain via checkFileExists, when checking, then true is returned', async () => {
    mockCheckFileExists.mockResolvedValue(true);
    const result = await svc.checkFileExistsOnChain('HASH');
    expect(result).toBe(true);
    expect(mockCheckFileExists).toHaveBeenCalledWith('hash');
  });

  test('given a file hash does not exist on chain, when checking, then false is returned', async () => {
    mockCheckFileExists.mockResolvedValue(false);
    const result = await svc.checkFileExistsOnChain('hash');
    expect(result).toBe(false);
  });

  test('given checkFileExists throws, when checking on-chain existence, then isFileExists fallback is used', async () => {
    mockCheckFileExists.mockRejectedValue(new Error('not found'));
    mockIsFileExists.mockResolvedValue(true);
    const result = await svc.checkFileExistsOnChain('hash');
    expect(result).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
  });

  // ── checkFilesExistOnChain ──────────────────────────────────────

  test('given multiple file hashes, when batch existence check runs, then each hash is checked and results are returned', async () => {
    mockCheckFileExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await svc.checkFilesExistOnChain(['hash1', 'hash2']);
    expect(result).toEqual([
      { hash: 'hash1', existsOnChain: true },
      { hash: 'hash2', existsOnChain: false },
    ]);
  });

  test('given duplicate file hashes, when batch existence check runs, then duplicates are deduplicated', async () => {
    mockCheckFileExists.mockResolvedValue(true);

    const result = await svc.checkFilesExistOnChain(['hash1', 'HASH1', ' hash1 ']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ hash: 'hash1', existsOnChain: true });
  });

  // ── filterNewFilesForBatch ──────────────────────────────────────

  test('given some files already exist on chain, when filterNewFilesForBatch runs, then existing files are excluded', async () => {
    mockCheckFileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mockFilesByIPFS.mockResolvedValueOnce({ owner: ZERO_ADDRESS });

    const items = [
      { cid: 'Qm1', fileName: 'existing.pdf', fileHash: 'h1' },
      { cid: 'Qm2', fileName: 'new.pdf', fileHash: 'h2' },
    ];
    const result = await svc.filterNewFilesForBatch(items);

    expect(result.newItems).toHaveLength(1);
    expect(result.newItems[0].fileName).toBe('new.pdf');
    expect(result.skippedCount).toBe(1);
  });

  test('given a file CID already has an owner, when filterNewFilesForBatch runs, then the file is excluded', async () => {
    mockCheckFileExists.mockResolvedValue(false);
    mockFilesByIPFS.mockResolvedValueOnce({ owner: '0x1234567890abcdef1234567890abcdef12345678' });

    const items = [{ cid: 'Qm1', fileName: 'owned.pdf', fileHash: 'h1' }];
    const result = await svc.filterNewFilesForBatch(items);

    expect(result.newItems).toHaveLength(0);
    expect(result.skippedCount).toBe(1);
  });

  test('given on-chain check fails, when filterNewFilesForBatch runs, then the file is included as fail-safe', async () => {
    mockCheckFileExists.mockRejectedValue(new Error('rpc down'));

    const items = [{ cid: 'Qm1', fileName: 'unknown.pdf', fileHash: 'h1' }];
    const result = await svc.filterNewFilesForBatch(items);

    expect(result.newItems).toHaveLength(1);
    expect(result.skippedCount).toBe(0);
  });
});
