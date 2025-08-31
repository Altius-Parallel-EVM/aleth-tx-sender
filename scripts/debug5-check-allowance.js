import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");
const UNISWAP_FILE_PATH = path.join("keys", "uniswap.json");

// --- WHICH USER/TOKEN TO CHECK ---
const USER_INDEX_TO_CHECK = 0;

// --- Logging Colors ---
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load data
  console.log("Loading configurations...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  const ownerAddress = userWalletsInfo[USER_INDEX_TO_CHECK].address;
  const spenderAddress = uniswapAddresses.router;
  const tokenAddress = tokenAddresses[USER_INDEX_TO_CHECK * 2];

  console.log(`\n${BLUE}--- Allowance Check ---${RESET}`);
  console.log(`Owner (User #${USER_INDEX_TO_CHECK}):  ${ownerAddress}`);
  console.log(`Spender (Router):       ${spenderAddress}`);
  console.log(`Token Contract:         ${tokenAddress}`);

  // 2. Create contract instance and check allowance
  const { abi: tokenAbi } = loadContract('musdc');
  const tokenContract = new Contract(tokenAddress, tokenAbi, provider);

  try {
    const allowanceAmount = await tokenContract.allowance(ownerAddress, spenderAddress);

    console.log(`\n${YELLOW}Current on-chain allowance is:${RESET}`);
    console.log(`${formatUnits(allowanceAmount, 18)} Tokens`);

  } catch (error) {
    console.error("\n--- Error ---");
    console.error("Failed to query allowance:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});