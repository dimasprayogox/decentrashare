import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DecentraShare - 4. recordFilesBatch() Whitebox Testing", function () {
  let decentrashare: any;
  let owner: any, user1: any;

  const CIDS_BATCH = ["QmCID1", "QmCID2", "QmCID3"];
  const NAMES_BATCH = ["doc1.pdf", "doc2.pdf", "doc3.pdf"];
  const HASHES_BATCH = [
    ethers.keccak256(ethers.toUtf8Bytes("doc1")),
    ethers.keccak256(ethers.toUtf8Bytes("doc2")),
    ethers.keccak256(ethers.toUtf8Bytes("doc3")),
  ];

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    decentrashare = await ethers.deployContract("DecentraShare");
  });

  it("Jalur Gagal: Gagal jika panjang array parameter tidak sama (ArrayLengthMismatch)", async function () {
    const invalidCids = ["QmCID1", "QmCID2"];
    await expect(
      decentrashare.connect(user1).recordFilesBatch(invalidCids, NAMES_BATCH, HASHES_BATCH)
    ).to.be.revertedWith("ArrayLengthMismatch");
  });

  it("Jalur Gagal: Gagal jika batch kosong (EmptyBatch)", async function () {
    await expect(
      decentrashare.connect(user1).recordFilesBatch([], [], [])
    ).to.be.revertedWith("EmptyBatch");
  });

  it("Jalur Gagal: Gagal jika ukuran batch melebihi batas maximum 10 (BatchTooLarge)", async function () {
    const largeCids = Array(11).fill("QmCID");
    const largeNames = Array(11).fill("doc.pdf");
    const largeHashes = Array(11).fill(HASHES_BATCH[0]);
    await expect(
      decentrashare.connect(user1).recordFilesBatch(largeCids, largeNames, largeHashes)
    ).to.be.revertedWith("BatchTooLarge");
  });

  it("Jalur Gagal: Gagal jika terdapat duplicate fileHash di dalam batch", async function () {
    const duplicateHashes = [HASHES_BATCH[0], HASHES_BATCH[0], HASHES_BATCH[2]];
    await expect(
      decentrashare.connect(user1).recordFilesBatch(CIDS_BATCH, NAMES_BATCH, duplicateHashes)
    ).to.be.revertedWith("DuplicateContent");
  });

  it("Jalur Gagal: Gagal jika terdapat duplicate ipfsHash di dalam batch", async function () {
    const duplicateCids = [CIDS_BATCH[0], CIDS_BATCH[0], CIDS_BATCH[2]];
    await expect(
      decentrashare.connect(user1).recordFilesBatch(duplicateCids, NAMES_BATCH, HASHES_BATCH)
    ).to.be.revertedWith("DuplicateCID");
  });

  it("Jalur Sukses: Berhasil merekam beberapa berkas secara sekaligus", async function () {
    const tx = await decentrashare.connect(user1).recordFilesBatch(CIDS_BATCH, NAMES_BATCH, HASHES_BATCH);

    await expect(tx)
      .to.emit(decentrashare, "BatchFilesRecorded")
      .withArgs(3n, user1.address);

    for (let i = 0; i < 3; i++) {
      const record = await decentrashare.filesByIPFS(CIDS_BATCH[i]);
      expect(record.ipfsHash).to.equal(CIDS_BATCH[i]);
      expect(record.fileName).to.equal(NAMES_BATCH[i]);
      expect(record.fileHash).to.equal(HASHES_BATCH[i]);
      expect(record.owner).to.equal(user1.address);
    }
  });
});
