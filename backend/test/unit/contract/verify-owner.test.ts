import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DecentraShare - verifyOwner() Unit Testing", function () {
  let decentrashare: any;
  let owner: any, user2: any;

  const CID = "QmTestCID123";
  const HASH = ethers.keccak256(ethers.toUtf8Bytes("file-asli.pdf"));

  beforeEach(async function () {
    [owner, user2] = await ethers.getSigners();
    decentrashare = await ethers.deployContract("DecentraShare");
  });

  it("Path Basis: Kembalikan alamat owner yang sah untuk CID terdaftar", async function () {
    await decentrashare.connect(user2).recordFile(CID, "file2.pdf", HASH);
    const fileOwner = await decentrashare.verifyOwner(CID);
    expect(fileOwner).to.equal(user2.address);
  });

  it("Path Basis: Kembalikan ZeroAddress untuk CID yang tidak terdaftar", async function () {
    const fileOwner = await decentrashare.verifyOwner("QmFakeCID");
    expect(fileOwner).to.equal(ethers.ZeroAddress);
  });
});
