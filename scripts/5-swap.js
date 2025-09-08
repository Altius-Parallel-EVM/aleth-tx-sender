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
const CHUNK_SIZE = 1000;

// --- NEW: CONFLICT RATE PARAMETER ---
// Set the desired conflict rate. 
// 0.2 means user[0] will execute the first 20% of swaps (200 txs).
// 1.0 means user[0] will execute all 1000 swaps.
// 0.0 means no conflicts, original behavior.
const CONFLICT_RATE = 0.2;

// --- Transaction Parameters ---
const SWAP_AMOUNT_IN = parseUnits("1", 18); // Swap 1 token (assuming 18 decimals)
const AMOUNT_OUT_MIN = 0; // We don't care about slippage in this test
const DEADLINE = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

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

  // 1. Load all necessary data from files
  console.log("Loading wallets, tokens, and Uniswap contract addresses...");
  const userWalletsInfo = JSON.parse(fs.readFileSync(WALLETS_FILE_PATH, "utf8"));
  const tokenAddresses = JSON.parse(fs.readFileSync(TOKENS_FILE_PATH, "utf8"));
  const uniswapAddresses = JSON.parse(fs.readFileSync(UNISWAP_FILE_PATH, "utf8"));

  const { abi: routerAbi } = loadContract('univ2-router');

  // 2. Prepare wallets and fetch initial nonces
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

  // 3. Process users in chunks
  const conflictTxCount = Math.floor(TX_COUNT * CONFLICT_RATE);
  console.log(`Conflict rate set to ${CONFLICT_RATE * 100}%. User[0] will execute the first ${conflictTxCount} swaps.`);

  for (let i = 0; i < TX_COUNT; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, TX_COUNT);
    console.log(`\n${BLUE}--- Processing transaction chunk: #${i} to #${chunkEnd - 1} ---${RESET}`);

    const swapPromises = [];

    // Prepare all swap transactions for the current chunk
    for (let m = i; m < chunkEnd; m++) {
      let swapperWallet;

      // Conditional logic to assign the swapper based on conflict rate
      if (m < conflictTxCount) {
        // This is a conflict transaction, executed by user[0]
        swapperWallet = userWallets[0];
      } else {
        // This is a normal transaction, executed by user[m]
        swapperWallet = userWallets[m];
      }

      const tokenInAddress = tokenAddresses[2 * m];
      const tokenOutAddress = tokenAddresses[2 * m + 1];

      // Get the correct nonce for the wallet that is actually sending the transaction
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
          { nonce: nonce }
        )
      );

      // IMPORTANT: Increment the nonce for the wallet that just sent the tx
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