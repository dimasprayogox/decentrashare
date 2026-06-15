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

describe('blockchain.service.ts - verifyTransaction() Whitebox Testing', () => {
  let blockchainService: any;

  beforeAll(async () => {
    const mod = await import('../../src/modules/blockchain/blockchain.service?cache-bust=06');
    blockchainService = mod.default;
  });

  beforeEach(() => {
    mockGetTransactionReceipt.mockReset();
    Object.values(logger).forEach((fn) => fn.mockReset());
  });

  test('verifyTransaction: Jalur 1 (Sukses & Terkonfirmasi)', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ status: 1, blockNumber: 99 });

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: true, blockNumber: 99 });
  });

  test('verifyTransaction: Jalur 2 (Sukses & Tidak Terkonfirmasi)', async () => {
    mockGetTransactionReceipt.mockResolvedValue({ status: 0, blockNumber: 99 });

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: false, blockNumber: 99 });
  });

  test('verifyTransaction: Jalur 3 (Transaksi Tidak Ditemukan)', async () => {
    mockGetTransactionReceipt.mockResolvedValue(null);

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: false });
  });

  test('verifyTransaction: Jalur 4 (RPC Error / Catch Block)', async () => {
    mockGetTransactionReceipt.mockRejectedValue(new Error('RPC Connection Lost'));

    const result = await blockchainService.verifyTransaction('0xTxHash');
    expect(result).toEqual({ confirmed: false });
  });
});
