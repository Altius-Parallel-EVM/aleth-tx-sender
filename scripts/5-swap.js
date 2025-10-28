import { Wallet, JsonRpcProvider, Contract, parseUnits } from "ethers";
import fs from "fs";
import path from "path";
import { loadContract } from './utils.js';

// --- Configuration ---
const RPC_URL = "http://127.0.0.1:8545";
const WALLETS_FILE_PATH = path.join("keys", "wallets.json");
const TOKENS_FILE_PATH = path.join("keys", "tokens.json");
const UNISWAP_FILE_PATH = path.join("keys", "uniswap.json");
const TX_COUNT = 1000;
const CHUNK_SIZE = 1000; // Use a reasonable chunk size for stability

// --- HYPERPARAMETER: CONFLICT RATE ---
// Defines the percentage of transactions that will all occur in the same pool (Pool 0)
// 0.2 means the first 20% of users (user[0] to user[199]) will all trade in Pool 0.
const CONFLICT_RATE = 0;

// --- Transaction Parameters ---
const SWAP_AMOUNT_IN = parseUnits("1", 18); // Swap 1 token
const AMOUNT_OUT_MIN = 0;
const DEADLINE = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
const GAS_LIMIT_PER_SWAP = 200000;

// --- Logging Colors ---
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

/**
 * Executes a batch of transactions and waits for confirmation.
 */
async function executeBatch(description, txPromises) {
  if (txPromises.length === 0) return;
  console.log(`  ${YELLOW}Executing: ${description} for ${txPromises.length} transactions...${RESET}`);
  const responses = await Promise.all(txPromises);
  const receiptPromises = responses.map(res => res.wait());
  await Promise.all(receiptPromises);
  console.log(`  ${GREEN}Confirmed: ${description} for ${txPromises.length} transactions.${RESET}`);
}

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  console.log("Connecting to local node...");

  // 1. Load data
  console.log("Loading wallets, tokens, and Uniswap contract addresses...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));
  const { abi: routerAbi } = loadContract('univ2-router');

  // 2. Prepare wallets and fetch nonces
  console.log(`Fetching initial nonces for all ${TX_COUNT} user wallets...`);
  const userWallets = userWalletsInfo.map(info => new Wallet(info.privateKey, provider));
  const nonceTrackers = new Map();
  const noncePromises = userWallets.map(async (wallet) => {
    const nonce = await provider.getTransactionCount(wallet.address);
    nonceTrackers.set(wallet.address, nonce);
  });
  await Promise.all(noncePromises);
  console.log(`${GREEN}Initial nonces fetched.${RESET}`);

  const startBlock = await provider.getBlockNumber();
  console.log(`\n${BLUE}--- Starting Transactions ---${RESET}`);
  console.log(`Starting Block Number: ${YELLOW}${startBlock}${RESET}`);

  // 3. Process transactions in chunks
  const conflictTxCount = Math.floor(TX_COUNT * CONFLICT_RATE);
  console.log(`Conflict rate set to ${CONFLICT_RATE * 100}%. The first ${conflictTxCount} users will all trade in Pool 0.`);

  for (let i = 0; i < TX_COUNT; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, TX_COUNT);
    console.log(`\n${BLUE}--- Processing transaction chunk: #${i} to #${chunkEnd - 1} ---${RESET}`);

    const swapPromises = [];

    // Prepare all swap transactions for the current chunk
    for (let m = i; m < chunkEnd; m++) {
      const swapperWallet = userWallets[m]; // The swapper is always user[m]
      let tokenInAddress, tokenOutAddress;

      // Conditional logic to assign the POOL for the transaction
      if (m < conflictTxCount) {
        // This is a CONFLICT transaction: user[m] trades in the shared Pool 0
        tokenInAddress = tokenAddresses[0];
        tokenOutAddress = tokenAddresses[1];
      } else {
        // This is a NORMAL transaction: user[m] trades in their own Pool m
        tokenInAddress = tokenAddresses[2 * m];
        tokenOutAddress = tokenAddresses[2 * m + 1];
      }

      let nonce = nonceTrackers.get(swapperWallet.address);
      const routerContract = new Contract(uniswapAddresses.router, routerAbi, swapperWallet);
      const path = [tokenInAddress, tokenOutAddress];

      swapPromises.push(
        routerContract.swapExactTokensForTokens(
          SWAP_AMOUNT_IN,
          AMOUNT_OUT_MIN,
          path,
          swapperWallet.address, // Send swapped tokens back to the swapper
          DEADLINE,
          { nonce: nonce, gasLimit: GAS_LIMIT_PER_SWAP }
        )
      );

      nonceTrackers.set(swapperWallet.address, nonce + 1);
    }

    await executeBatch(`Executing Swaps for transactions #${i} to #${chunkEnd - 1}`, swapPromises);
  }

  const endBlock = await provider.getBlockNumber();
  console.log(`\n${BLUE}--- Transactions Confirmed ---${RESET}`);
  console.log(`Ending Block Number:   ${YELLOW}${endBlock}${RESET}`);
  console.log(`All swap transactions are included in blocks from ${YELLOW}${startBlock}${RESET} to ${YELLOW}${endBlock}${RESET}.`);

  console.log(`\n\n${GREEN}--- All ${TX_COUNT} swap transactions are complete! Dataset generated. ---${RESET}`);
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});