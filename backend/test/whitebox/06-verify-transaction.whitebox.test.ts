import { beforeEach, beforeAll, describe, expect, mock, test } from 'bun:test';

const mockGetTransactionReceipt = mock();

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
        return {};
      }),
    },
  };
});

const logger = { debug: mock(), error: mock(), info: mock(), warn: mock() };
mock.module('../../src/utils/logger', () => ({ logger }));
mock.module('../../src/utils/logger.js', () => ({ logger }));

mock.module('../../src/abis/DecentraShare.json', () => ({
  default: {
    abi: [],
  },
}));

describe('verifyTransaction()', () => {
  let blockchainService: any;

  beforeAll(async () => {
    const mod = await import('../../src/modules/blockchain/blockchain.service?cache-bust=06');
    blockchainService = mod.default;
  });

  beforeEach(() => {
    mockGetTransactionReceipt.mockReset();
    Object.values(logger).forEach((fn) => fn.mockReset());
  });

  test('Path 1 (Tidak Valid): terjadi error pada koneksi RPC/catch block', async () => {
    mockGetTransactionReceipt.mockRejectedValue(new Error('RPC Connection Lost'));

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: false });
  });

  test('Path 2 (Tidak Valid): resi transaksi tidak ditemukan di blockchain', async () => {
    mockGetTransactionReceipt.mockResolvedValue(null);

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: false });
  });

  test('Path 3 (Valid): transaksi terkonfirmasi dengan status sukses', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ status: 1, blockNumber: 99 });

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: true, blockNumber: 99 });
  });

  test('Path 4 (Valid): transaksi terkonfirmasi dengan status gagal', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ status: 0, blockNumber: 99 });

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: false, blockNumber: 99 });
  });
});
