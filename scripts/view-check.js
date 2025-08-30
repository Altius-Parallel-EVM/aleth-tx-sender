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
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load contracts and addresses
  console.log("Loading configuration...");
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  if (tokenAddresses.length < 2) {
    throw new Error("Not enough token addresses in tokens.json to check a pair.");
  }

  const tokenAAddress = tokenAddresses[0];
  const tokenBAddress = tokenAddresses[1];
  const routerAddress = uniswapAddresses.router;
  const factoryAddress = uniswapAddresses.factory;

  const { abi: routerAbi } = loadContract('univ2-router');
  const { abi: factoryAbi } = loadContract('univ2-factory');
  const { abi: pairAbi } = loadContract('univ2-pair');

  console.log(`\n${BLUE}--- Initial State Check ---${RESET}`);
  console.log(`Router Address:  ${routerAddress}`);
  console.log(`Factory Address: ${factoryAddress}`);
  console.log(`Token A Address: ${tokenAAddress}`);
  console.log(`Token B Address: ${tokenBAddress}`);

  try {
    // --- Step 1: Check Router's factory() method ---
    console.log(`\n${YELLOW}--- Step 1: Checking Router's Factory Address ---${RESET}`);
    const routerContract = new Contract(routerAddress, routerAbi, provider);
    const factoryAddressFromRouter = await routerContract.factory();
    
    console.log(`Expected Factory:      ${factoryAddress}`);
    console.log(`Returned from Router:  ${factoryAddressFromRouter}`);

    if (factoryAddress.toLowerCase() === factoryAddressFromRouter.toLowerCase()) {
      console.log(`${GREEN}✅ SUCCESS: Router points to the correct Factory.${RESET}`);
    } else {
      console.log(`${RED}❌ FAILURE: Router points to an incorrect Factory address!${RESET}`);
      return; // Stop if this fundamental check fails
    }

    // --- Step 2: Check Factory's getPair() method ---
    console.log(`\n${YELLOW}--- Step 2: Checking for Pair on Factory ---${RESET}`);
    const factoryContract = new Contract(factoryAddress, factoryAbi, provider);
    const pairAddress = await factoryContract.getPair(tokenAAddress, tokenBAddress);
    
    console.log(`Address returned by getPair(): ${pairAddress}`);

    // --- Step 3: Check Pair's getReserves() method ---
    console.log(`\n${YELLOW}--- Step 3: Checking Pair Reserves ---${RESET}`);
    if (pairAddress === "0x0000000000000000000000000000000000000000") {
      console.log(`${GREEN}✅ SUCCESS: Pair does not exist (address is 0x0), as expected on a clean state. Cannot check reserves.${RESET}`);
    } else {
      console.log(`Pair found at ${pairAddress}. Querying its reserves...`);
      const pairContract = new Contract(pairAddress, pairAbi, provider);
      const [reserve0, reserve1] = await pairContract.getReserves();
      
      console.log(`Reserve 0: ${formatUnits(reserve0, 18)}`);
      console.log(`Reserve 1: ${formatUnits(reserve1, 18)}`);
      
      if (reserve0 === 0n && reserve1 === 0n) {
          console.log(`${GREEN}✅ SUCCESS: Pair exists but is empty (reserves are 0), as expected for a new pair.${RESET}`);
      } else {
          console.log(`${YELLOW}ℹ️ INFO: Pair exists and contains liquidity.${RESET}`);
      }
    }
    
    console.log(`\n${BLUE}--- Debugging Check Complete ---${RESET}`);

  } catch (error) {
    console.error(`\n${RED}--- An error occurred during a read-only call ---${RESET}`);
    console.error("This could mean an incorrect ABI, a bad contract address, or a node connection issue.");
    console.error(error);
    process.exit(1);
  }
}

main();