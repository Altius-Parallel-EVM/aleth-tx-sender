import { Wallet, JsonRpcProvider, Contract } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
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

  // 1. Load necessary accounts and addresses
  console.log("Loading user wallet, tokens, and Uniswap Factory address...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  if (userWalletsInfo.length < 1) throw new Error("No user wallets found.");
  if (tokenAddresses.length < 2) throw new Error("Not enough tokens found to create a pair.");

  // Use the first user wallet to send the transaction
  const userWallet = new Wallet(userWalletsInfo[0].privateKey, provider);
  const tokenAAddress = tokenAddresses[0];
  const tokenBAddress = tokenAddresses[1];
  const factoryAddress = uniswapAddresses.factory;

  console.log(`\n${BLUE}Action Details:${RESET}`);
  console.log(`- Signer (users[0]): ${userWallet.address}`);
  console.log(`- Factory Contract:  ${factoryAddress}`);
  console.log(`- Token A:           ${tokenAAddress}`);
  console.log(`- Token B:           ${tokenBAddress}`);

  // 2. Create Factory contract instance
  const { abi: factoryAbi } = loadContract('univ2-factory');
  const factoryContract = new Contract(factoryAddress, factoryAbi, userWallet);

  try {
    // 3. Call the createPair function
    console.log(`\n${YELLOW}Attempting to call createPair(tokenA, tokenB)...${RESET}`);
    const tx = await factoryContract.createPair(tokenAAddress, tokenBAddress);

    console.log(`Transaction sent! Hash: ${BLUE}${tx.hash}${RESET}`);
    console.log("Waiting for confirmation...");

    const receipt = await tx.wait();

    if (receipt.status === 0) {
      throw new Error("Transaction was confirmed but reverted on-chain.");
    }

    console.log(`${GREEN}Transaction confirmed successfully!${RESET}`);

    // 4. Verify that the pair was created
    console.log(`\n${YELLOW}Verifying pair creation...${RESET}`);
    const pairAddress = await factoryContract.getPair(tokenAAddress, tokenBAddress);

    console.log(`Address returned by getPair(): ${BLUE}${pairAddress}${RESET}`);

    if (pairAddress !== "0x0000000000000000000000000000000000000000") {
      console.log(`${GREEN}--- SUCCESS! The pair contract was created successfully. ---${RESET}`);
    } else {
      console.log(`${RED}--- FAILURE! The pair address is still the zero address after the transaction. ---${RESET}`);
    }

  } catch (error) {
    console.error(`\n${RED}--- ERROR ---${RESET}`);
    console.error("The createPair transaction failed.");
    console.error("This indicates a potential issue within the Factory contract's implementation itself, possibly related to the CREATE2 opcode or the pair contract's bytecode.");
    console.error("\nOriginal error message:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});