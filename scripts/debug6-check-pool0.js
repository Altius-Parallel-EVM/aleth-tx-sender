import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");
const UNISWAP_FILE_PATH = path.join("keys", "uniswap.json");

// --- WHICH USER TO CHECK ---
const USER_INDEX_TO_CHECK = 105;

// --- Logging Colors ---
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load data
  console.log("Loading configurations...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  if (USER_INDEX_TO_CHECK >= userWalletsInfo.length) {
    throw new Error(`Invalid USER_INDEX_TO_CHECK: ${USER_INDEX_TO_CHECK}. Max index is ${userWalletsInfo.length - 1}.`);
  }

  const ownerAddress = userWalletsInfo[USER_INDEX_TO_CHECK].address;
  const spenderAddress = uniswapAddresses.router;
  // For Pool 0 swaps, the input token is always token[0]
  const tokenAddress = tokenAddresses[0];

  console.log(`\n${BLUE}--- State Check for User #${USER_INDEX_TO_CHECK} regarding Pool 0 ---${RESET}`);
  console.log(`Owner (User):     ${ownerAddress}`);
  console.log(`Spender (Router):   ${spenderAddress}`);
  console.log(`Token (Token 0):  ${tokenAddress}`);

  // 2. Create contract instance and check state
  const { abi: tokenAbi } = loadContract('musdc');
  const tokenContract = new Contract(tokenAddress, tokenAbi, provider);

  try {
    // Check Balance
    const balance = await tokenContract.balanceOf(ownerAddress);
    console.log(`\n${YELLOW}1. Checking Balance...${RESET}`);
    console.log(`   User's balance of Token 0: ${GREEN}${formatUnits(balance, 18)}${RESET}`);

    // Check Allowance
    const allowanceAmount = await tokenContract.allowance(ownerAddress, spenderAddress);
    console.log(`\n${YELLOW}2. Checking Allowance...${RESET}`);
    console.log(`   User's allowance for the Router: ${GREEN}${formatUnits(allowanceAmount, 18)}${RESET}`);

    console.log(`\n${BLUE}--- Conclusion ---${RESET}`);
    if (balance > 0 && allowanceAmount > 0) {
      console.log(`${GREEN}✅ The user IS prepared. Balance and allowance are sufficient.${RESET}`);
    } else {
      console.log(`${RED}❌ The user IS NOT prepared. Balance or allowance is zero.${RESET}`);
      console.log("This confirms the previous preparation script (4-...) had a bug and did not correctly set up all users for Pool 0 swaps.");
    }

  } catch (error) {
    console.error("\n--- Error ---");
    console.error("Failed to query state:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});