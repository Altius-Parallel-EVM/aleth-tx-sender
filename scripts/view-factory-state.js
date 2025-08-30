import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");
const UNISWAP_FILE_PATH = path.join("keys", "uniswap.json");

// --- Logging Colors ---
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load addresses from files
  console.log("Loading Uniswap and token addresses...");
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  if (tokenAddresses.length < 2) {
    throw new Error("Not enough token addresses in tokens.json to check a pair.");
  }

  console.log(`\n${BLUE}Factory Contract Address:${RESET} ${uniswapAddresses.factory}`);

  // 2. Load contract ABIs and create a contract instance for the Factory
  const { abi: factoryAbi } = loadContract('univ2-factory');
  const factoryContract = new Contract(uniswapAddresses.factory, factoryAbi, provider);

  // 3. Get the total number of pairs created by the factory
  try {
    const pairCount = await factoryContract.allPairsLength();
    console.log(`\n${YELLOW}--- Factory State ---${RESET}`);
    console.log(`${GREEN}Total pairs created (allPairsLength):${RESET} ${pairCount.toString()}`);

    // 4. Get the address for a specific pair (tokens[0] and tokens[1])
    const tokenA = tokenAddresses[0];
    const tokenB = tokenAddresses[1];
    console.log(`\n${YELLOW}--- Specific Pair Check ---${RESET}`);
    console.log(`Checking for pair between:`);
    console.log(`  - Token A: ${tokenA}`);
    console.log(`  - Token B: ${tokenB}`);

    const pairAddress = await factoryContract.getPair(tokenA, tokenB);
    console.log(`\n${GREEN}Result from getPair:${RESET} ${pairAddress}`);

    // 5. If the pair exists, get its reserves
    if (pairAddress !== "0x0000000000000000000000000000000000000000") {
      console.log(`\n${YELLOW}--- Pair Reserves ---${RESET}`);
      console.log(`Pair contract found! Fetching reserves...`);

      const { abi: pairAbi } = loadContract('univ2-pair');
      const pairContract = new Contract(pairAddress, pairAbi, provider);

      const reserves = await pairContract.getReserves();
      const [reserve0, reserve1] = reserves;

      // Note: Assumes tokens have 18 decimals for formatting.
      console.log(`${GREEN}Reserve 0:${RESET} ${formatUnits(reserve0, 18)}`);
      console.log(`${GREEN}Reserve 1:${RESET} ${formatUnits(reserve1, 18)}`);
    } else {
      console.log("\nThis pair has not been created yet (no liquidity added).");
    }

  } catch (error) {
    console.error("\n--- Error ---");
    console.error("Failed to query contract state. Details:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});