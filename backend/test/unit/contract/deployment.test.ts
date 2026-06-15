import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DecentraShare - Deployment Unit Testing", function () {
  let decentrashare: any;
  const HASH = ethers.keccak256(ethers.toUtf8Bytes("file-asli.pdf"));
  const CID = "QmTestCID123";

  beforeEach(async function () {
    decentrashare = await ethers.deployContract("DecentraShare");
  });

  it("Jalur Sukses: Pastikan smart contract berhasil di-deploy dan address valid", async function () {
    expect(decentrashare.target).to.not.equal(ethers.ZeroAddress);
    expect(decentrashare.target).to.properAddress;
  });

  it("Jalur Basis: Pastikan state awal isFileExists bernilai false untuk hash dummy", async function () {
    const exists = await decentrashare.checkFileExists(HASH);
    expect(exists).to.be.false;
  });

  it("Jalur Basis: Pastikan owner bernilai ZeroAddress untuk CID yang belum terdaftar", async function () {
    const fileOwner = await decentrashare.verifyOwner(CID);
    expect(fileOwner).to.equal(ethers.ZeroAddress);
  });
});
