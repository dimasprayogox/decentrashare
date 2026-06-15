import "@nomicfoundation/hardhat-verify";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "dotenv/config";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_TEST_GET_TEST_FILES } from "hardhat/builtin-tasks/task-names";

subtask(TASK_TEST_GET_TEST_FILES, async (taskArgs, hre, runSuper) => {
  const testFiles = await runSuper(taskArgs);
  return testFiles.filter((file: string) => {
    return (
      file.includes("04-record-files-batch.whitebox") ||
      file.includes("record-file.test") ||
      file.includes("verify-owner.test") ||
      file.includes("deployment.test") ||
      file.includes("check-file-exists.test")
    );
  });
});

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/Q2k67vQN51qATSdRmtkbl",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  paths: {
    tests: "./test"
  }
};

export default config;
