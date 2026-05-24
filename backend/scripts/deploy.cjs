require("dotenv").config();

// ✅ Require plugin ethers secara eksplisit
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Memulai proses deployment ke jaringan SEPOLIA...");

  // ✅ Debug: pastikan ethers ter-load
  if (!hre.ethers) {
    throw new Error("hre.ethers is undefined! Plugin hardhat-ethers tidak ter-load.");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying dengan akun: ${deployer.address}`);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);

  console.log("Deploying kontrak...");
  
  const factory = await hre.ethers.getContractFactory("DecentraShare");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`Smart Contract berhasil dideploy!`);
  console.log(`Alamat Kontrak: ${address}`);

  // Update file .env secara otomatis
  const envPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf-8");
    if (envContent.includes("CONTRACT_ADDRESS=")) {
      envContent = envContent.replace(
        /CONTRACT_ADDRESS=.*/,
        `CONTRACT_ADDRESS=${address}`
      );
    } else {
      envContent += `\nCONTRACT_ADDRESS=${address}`;
    }
    fs.writeFileSync(envPath, envContent);
    console.log(`Contract address tersimpan di .env`);
  }
}

main().catch((error) => {
  console.error("Terjadi Error saat deploy:", error);
  process.exitCode = 1;
});