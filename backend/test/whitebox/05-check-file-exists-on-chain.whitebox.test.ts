import { beforeEach, beforeAll, describe, expect, mock, test } from 'bun:test';

const mockCheckFileExists = mock();
const mockIsFileExists = mock();

mock.module('ethers', () => {
  return {
    ethers: {
      ZeroAddress: '0x0000000000000000000000000000000000000000',
      JsonRpcProvider: mock(function () {
        return {};
      }),
      Contract: mock(function () {
        return {
          checkFileExists: mockCheckFileExists,
          isFileExists: mockIsFileExists,
        };
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

describe('blockchain.service.ts - checkFileExistsOnChain() Whitebox Testing', () => {
  let blockchainService: any;

  beforeAll(async () => {
    const mod = await import('../../src/modules/blockchain/blockchain.service?cache-bust=05');
    blockchainService = mod.default;
  });

  beforeEach(() => {
    mockCheckFileExists.mockReset();
    mockIsFileExists.mockReset();
    Object.values(logger).forEach((fn) => fn.mockReset());
  });

  test('checkFileExistsOnChain: Jalur 1 (Sukses checkFileExists)', async () => {
    mockCheckFileExists.mockResolvedValue(true);

    const result = await blockchainService.checkFileExistsOnChain('0xHash');
    expect(result).toBeTrue();
  });

  test('checkFileExistsOnChain: Jalur 2 (Gagal checkFileExists, Fallback ke isFileExists)', async () => {
    mockCheckFileExists.mockRejectedValue(new Error('Method checkFileExists not found'));
    mockIsFileExists.mockResolvedValue(true);

    const result = await blockchainService.checkFileExistsOnChain(' 0xHash ');
    expect(result).toBeTrue();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('checkFileExistsOnChain: Jalur 3 (Semua Gagal / Catch Block)', async () => {
    mockCheckFileExists.mockRejectedValue(new Error('Method checkFileExists failed'));
    mockIsFileExists.mockRejectedValue(new Error('Method isFileExists failed'));

    await expect(blockchainService.checkFileExistsOnChain('0xHash')).rejects.toThrow('Method isFileExists failed');
  });
});
