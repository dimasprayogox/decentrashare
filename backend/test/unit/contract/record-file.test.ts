import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DecentraShare - recordFile() Unit Testing", function () {
  let decentrashare: any;
  let owner: any, user1: any;

  const CID = "QmTestCID123";
  const HASH = ethers.keccak256(ethers.toUtf8Bytes("file-asli.pdf"));
  const WRONG_HASH = ethers.keccak256(ethers.toUtf8Bytes("file-berbeda.pdf"));

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    decentrashare = await ethers.deployContract("DecentraShare");
  });

  it("Jalur Gagal: Gagal jika fileHash sudah terdaftar (DuplicateContent)", async function () {
    await decentrashare.connect(user1).recordFile(CID, "file1.pdf", HASH);
    await expect(
      decentrashare.connect(user1).recordFile("QmDifferentCID", "file2.pdf", HASH)
    ).to.be.revertedWith("DuplicateContent");
  });

  it("Jalur Gagal: Gagal jika ipfsHash sudah terdaftar (DuplicateCID)", async function () {
    await decentrashare.connect(user1).recordFile(CID, "file1.pdf", HASH);
    await expect(
      decentrashare.connect(user1).recordFile(CID, "file2.pdf", WRONG_HASH)
    ).to.be.revertedWith("DuplicateCID");
  });

  it("Jalur Sukses: Berhasil menyimpan berkas ke blockchain jika input valid", async function () {
    const tx = await decentrashare.connect(user1).recordFile(CID, "file-asli.pdf", HASH);

    await expect(tx).to.emit(decentrashare, "FileRecorded");

    const record = await decentrashare.filesByIPFS(CID);
    expect(record.ipfsHash).to.equal(CID);
    expect(record.fileName).to.equal("file-asli.pdf");
    expect(record.fileHash).to.equal(HASH);
    expect(record.owner).to.equal(user1.address);
    expect(record.timestamp).to.be.gt(0n);
  });
});
