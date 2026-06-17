import { beforeEach, beforeAll, describe, expect, mock, test } from 'bun:test';

// Definisikan mock function untuk dipantau/diatur perilakunya
const mockGetTransactionReceipt = mock();
const mockFilesByIPFS = mock();
const mockCheckFileExists = mock();
const mockIsFileExists = mock();
const mockEstimateGasRecordFile = mock();
const mockEstimateGasRecordFilesBatch = mock();

// Mock module ethers
mock.module('ethers', () => {
  return {
    ethers: {
      ZeroAddress: '0x0000000000000000000000000000000000000000',
      JsonRpcProvider: mock(function () {
        return {
          getTransactionReceipt: mockGetTransactionReceipt,
        };
      }),
      Contract: mock(function () {
        return {
          filesByIPFS: mockFilesByIPFS,
          checkFileExists: mockCheckFileExists,
          isFileExists: mockIsFileExists,
          recordFile: {
            estimateGas: mockEstimateGasRecordFile,
          },
          recordFilesBatch: {
            estimateGas: mockEstimateGasRecordFilesBatch,
          },
        };
      }),
    },
  };
});


// Mock logger
const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };
mock.module('../../../../src/utils/logger', () => ({ logger }));
mock.module('../../../../src/utils/logger.js', () => ({ logger }));

// Mock ABI DecentraShare
mock.module('../../../../src/abis/DecentraShare.json', () => ({
  default: {
    abi: [],
  },
}));

describe('Feature: blockchain.service.ts Whitebox Testing', () => {
  let blockchainService: any;

  beforeAll(async () => {
    // Memaksa evaluasi modul baru untuk mem-bypass cache import global Bun
    const mod = await import('../../../../src/modules/blockchain/blockchain.service?cache-bust=1');
    blockchainService = mod.default;
  });

  beforeEach(() => {
    mockGetTransactionReceipt.mockReset();
    mockFilesByIPFS.mockReset();
    mockCheckFileExists.mockReset();
    mockIsFileExists.mockReset();
    mockEstimateGasRecordFile.mockReset();
    mockEstimateGasRecordFilesBatch.mockReset();
    Object.values(logger).forEach((fn) => fn.mockReset());
  });

  // ==========================================
  // 1. prepareTransactionData()
  // ==========================================
  test('prepareTransactionData: pastikan data transaksi single file di-format dengan benar', () => {
    const result = blockchainService.prepareTransactionData('QmCID', 'test.pdf', '0xHash');

    expect(result.functionName).toBe('recordFile');
    expect(result.args).toEqual(['QmCID', 'test.pdf', '0xHash']);
    expect(result.contractAddress).toBeDefined();
  });

  // ==========================================
  // 2. prepareBatchTransactionData()
  // ==========================================
  test('prepareBatchTransactionData: pastikan payload batch di-format dengan array paralel', () => {
    const items = [
      { cid: 'QmCID1', fileName: 'doc1.pdf', fileHash: '0xHash1', documentId: 'doc-1' },
      { cid: 'QmCID2', fileName: 'doc2.pdf', fileHash: '0xHash2', documentId: 'doc-2' },
    ];
    const result = blockchainService.prepareBatchTransactionData(items);

    expect(result.functionName).toBe('recordFilesBatch');
    expect(result.args[0]).toEqual(['QmCID1', 'QmCID2']);
    expect(result.args[1]).toEqual(['doc1.pdf', 'doc2.pdf']);
    expect(result.args[2]).toEqual(['0xHash1', '0xHash2']);
    expect(result.documentIds).toEqual(['doc-1', 'doc-2']);
  });


  // ==========================================
  // 4. getFileRecord()
  // ==========================================
  test('getFileRecord: Path 1 (Sukses mengambil data)', async () => {
    const mockRecord = { owner: '0xOwner', timestamp: 123456n };
    mockFilesByIPFS.mockResolvedValue(mockRecord);

    const result = await blockchainService.getFileRecord('0xHash');
    expect(result).toEqual(mockRecord);
  });

  test('getFileRecord: Path 2 (Gagal / Catch Block)', async () => {
    mockFilesByIPFS.mockRejectedValue(new Error('Failed mapping call'));

    const result = await blockchainService.getFileRecord('0xHash');
    expect(result).toBeNull();
  });

  // ==========================================
  // 5. estimateGas()
  // ==========================================
  test('estimateGas: Path 1 (Sukses estimasi gas)', async () => {
    mockEstimateGasRecordFile.mockResolvedValue(120000n);

    const result = await blockchainService.estimateGas('QmCID', 'test.pdf', '0xHash');
    expect(result).toBe(120000n);
  });

  test('estimateGas: Path 2 (Gagal / Catch Block / Fallback)', async () => {
    mockEstimateGasRecordFile.mockRejectedValue(new Error('Gas execution reverted'));

    const result = await blockchainService.estimateGas('QmCID', 'test.pdf', '0xHash');
    expect(result).toBe(200000n); // Nilai fallback default
  });

  // ==========================================
  // 6. estimateBatchGas()
  // ==========================================
  test('estimateBatchGas: Path 1 (Sukses estimasi gas batch)', async () => {
    mockEstimateGasRecordFilesBatch.mockResolvedValue(450000n);

    const result = await blockchainService.estimateBatchGas([
      { cid: 'Qm1', fileName: '1.pdf', fileHash: '0x1' },
    ]);
    expect(result).toBe(450000n);
  });

  test('estimateBatchGas: Path 2 (Gagal / Catch Block / Fallback Kalkulasi)', async () => {
    mockEstimateGasRecordFilesBatch.mockRejectedValue(new Error('Batch gas execution reverted'));

    const items = [
      { cid: 'Qm1', fileName: '1.pdf', fileHash: '0x1' },
      { cid: 'Qm2', fileName: '2.pdf', fileHash: '0x2' },
    ];
    const result = await blockchainService.estimateBatchGas(items);
    expect(result).toBe(400000n); // 200000n * 2 items
  });


  // ==========================================
  // 8. checkFilesExistOnChain()
  // ==========================================
  test('checkFilesExistOnChain: pastikan pengecekan massal berjalan dengan array unique', async () => {
    mockCheckFileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await blockchainService.checkFilesExistOnChain(['0xHash1', '0xHash2', ' 0xHash1 ']);
    expect(result).toHaveLength(2); // Duplikasi dihapus
    expect(result[0]).toEqual({ hash: '0xhash1', existsOnChain: true });
    expect(result[1]).toEqual({ hash: '0xhash2', existsOnChain: false });
  });

  // ==========================================
  // 9. filterNewFilesForBatch()
  // ==========================================
  test('filterNewFilesForBatch: Path filter lengkap', async () => {
    // Item 1: Sudah ada on-chain (skip)
    mockCheckFileExists.mockResolvedValueOnce(true);

    // Item 2: Belum on-chain tapi CID sudah ada owner-nya (skip)
    mockCheckFileExists.mockResolvedValueOnce(false);
    mockFilesByIPFS.mockResolvedValueOnce({ owner: '0xSomeOwner' });

    // Item 3: Belum on-chain & CID owner ZeroAddress (lulus)
    mockCheckFileExists.mockResolvedValueOnce(false);
    mockFilesByIPFS.mockResolvedValueOnce({ owner: '0x0000000000000000000000000000000000000000' });

    // Item 4: RPC error (fail-safe lulus)
    mockCheckFileExists.mockRejectedValueOnce(new Error('RPC Timeout'));

    const items = [
      { cid: 'Qm1', fileName: '1.pdf', fileHash: '0x1' },
      { cid: 'Qm2', fileName: '2.pdf', fileHash: '0x2' },
      { cid: 'Qm3', fileName: '3.pdf', fileHash: '0x3' },
      { cid: 'Qm4', fileName: '4.pdf', fileHash: '0x4' },
    ];

    const result = await blockchainService.filterNewFilesForBatch(items);
    expect(result.newItems).toHaveLength(2);
    expect(result.newItems[0].cid).toBe('Qm3');
    expect(result.newItems[1].cid).toBe('Qm4');
    expect(result.skippedCount).toBe(2);
  });
});
