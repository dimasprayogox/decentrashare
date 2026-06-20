import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("recordFilesBatch()", function () {
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

  it("Path 1 (Tidak Valid): panjang array parameter cids, names, dan hashes tidak sama", async function () {
    const invalidCids = ["QmCID1", "QmCID2"];
    await expect(
      decentrashare.connect(user1).recordFilesBatch(invalidCids, NAMES_BATCH, HASHES_BATCH)
    ).to.be.revertedWith("ArrayLengthMismatch");
  });

  it("Path 2 (Tidak Valid): mengirimkan batch kosong", async function () {
    await expect(
      decentrashare.connect(user1).recordFilesBatch([], [], [])
    ).to.be.revertedWith("EmptyBatch");
  });

  it("Path 3 (Tidak Valid): ukuran batch melebihi batas maksimum 10 berkas", async function () {
    const largeCids = Array(11).fill("QmCID");
    const largeNames = Array(11).fill("doc.pdf");
    const largeHashes = Array(11).fill(HASHES_BATCH[0]);
    await expect(
      decentrashare.connect(user1).recordFilesBatch(largeCids, largeNames, largeHashes)
    ).to.be.revertedWith("BatchTooLarge");
  });

  it("Path 4 (Tidak Valid): terdapat duplikasi fileHash di dalam batch", async function () {
    const duplicateHashes = [HASHES_BATCH[0], HASHES_BATCH[0], HASHES_BATCH[2]];
    await expect(
      decentrashare.connect(user1).recordFilesBatch(CIDS_BATCH, NAMES_BATCH, duplicateHashes)
    ).to.be.revertedWith("DuplicateContent");
  });

  it("Path 5 (Tidak Valid): terdapat duplikasi ipfsHash di dalam batch", async function () {
    const duplicateCids = [CIDS_BATCH[0], CIDS_BATCH[0], CIDS_BATCH[2]];
    await expect(
      decentrashare.connect(user1).recordFilesBatch(duplicateCids, NAMES_BATCH, HASHES_BATCH)
    ).to.be.revertedWith("DuplicateCID");
  });

  it("Path 6 (Valid): berhasil merekam satu berkas ke blockchain", async function () {
    const singleCid = [CIDS_BATCH[0]];
    const singleName = [NAMES_BATCH[0]];
    const singleHash = [HASHES_BATCH[0]];

    const tx = await decentrashare.connect(user1).recordFilesBatch(singleCid, singleName, singleHash);

    await expect(tx)
      .to.emit(decentrashare, "BatchFilesRecorded")
      .withArgs(1n, user1.address);

    const record = await decentrashare.filesByIPFS(singleCid[0]);
    expect(record.ipfsHash).to.equal(singleCid[0]);
    expect(record.fileName).to.equal(singleName[0]);
    expect(record.fileHash).to.equal(singleHash[0]);
    expect(record.owner).to.equal(user1.address);
  });

  it("Path 7 (Valid): berhasil merekam lebih dari satu berkas batch ke blockchain", async function () {
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
