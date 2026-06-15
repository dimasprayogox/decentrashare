import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DecentraShare - checkFileExists() Unit Testing", function () {
  let decentrashare: any;
  let owner: any, user1: any;

  const CID = "QmTestCID123";
  const HASH = ethers.keccak256(ethers.toUtf8Bytes("file-asli.pdf"));

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    decentrashare = await ethers.deployContract("DecentraShare");
  });

  it("Jalur Basis: Kembalikan true jika hash berkas terdaftar di blockchain", async function () {
    await decentrashare.connect(user1).recordFile(CID, "file1.pdf", HASH);
    const exists = await decentrashare.checkFileExists(HASH);
    expect(exists).to.be.true;
  });

  it("Jalur Basis: Kembalikan false jika hash berkas tidak terdaftar di blockchain", async function () {
    const exists = await decentrashare.checkFileExists(HASH);
    expect(exists).to.be.false;
  });
});
