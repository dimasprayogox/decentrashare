import { ethers } from "ethers";
import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Memulai proses deployment ke Ganache...");

  const ganacheUrl = process.env.GANACHE_URL ?? "http://127.0.0.1:7545";
  const provider = new ethers.JsonRpcProvider(ganacheUrl);

  const accounts = await provider.listAccounts();
  const deployer = accounts[0];

  console.log(`📦 Deploying dengan akun: ${deployer.address}`);

  const balance = await provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

  // Baca artifact hasil compile
  const artifactPath = path.resolve(
    __dirname,
    "../artifacts/contracts/DecentraShare.sol/DecentraShare.json"
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact tidak ditemukan. Jalankan: npx hardhat compile`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    deployer
  );

  console.log("🚀 Deploying kontrak...");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ Smart Contract berhasil dideploy!`);
  console.log(`📍 Alamat Kontrak: ${address}`);

  // Simpan address ke .env
  const envPath = path.resolve(__dirname, "../.env");
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
  console.log(`💾 Contract address tersimpan di .env`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});