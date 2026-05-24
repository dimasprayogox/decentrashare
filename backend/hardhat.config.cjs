require("@nomicfoundation/hardhat-verify"); 
require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/Q2k67vQN51qATSdRmtkbl",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};