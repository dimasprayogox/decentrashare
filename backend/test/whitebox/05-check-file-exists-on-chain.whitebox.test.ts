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

describe('checkFileExistsOnChain()', () => {
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

  test('Path 1 (Valid): checkFileExists berhasil mengonfirmasi berkas', async () => {
    mockCheckFileExists.mockResolvedValue(true);

    const result = await blockchainService.checkFileExistsOnChain('0xHash');
    expect(result).toBeTrue();
  });

  test('Path 2 (Valid): checkFileExists gagal dan fallback menggunakan isFileExists', async () => {
    mockCheckFileExists.mockRejectedValue(new Error('Method checkFileExists not found'));
    mockIsFileExists.mockResolvedValue(true);

    const result = await blockchainService.checkFileExistsOnChain(' 0xHash ');
    expect(result).toBeTrue();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('Path 3 (Tidak Valid): seluruh pemanggilan RPC contract gagal/catch block', async () => {
    mockCheckFileExists.mockRejectedValue(new Error('Method checkFileExists failed'));
    mockIsFileExists.mockRejectedValue(new Error('Method isFileExists failed'));

    await expect(blockchainService.checkFileExistsOnChain('0xHash')).rejects.toThrow('Method isFileExists failed');
  });
});
