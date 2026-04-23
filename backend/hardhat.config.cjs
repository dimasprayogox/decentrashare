require("@nomicfoundation/hardhat-ethers"); // Kita panggil ethers-nya saja
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/Q2k67vQN51qATSdRmtkbl",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};