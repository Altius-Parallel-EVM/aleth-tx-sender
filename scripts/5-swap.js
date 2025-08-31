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
  console.log(`  ${YELLOW}Executing: ${description} for ${txPromises.length} users...${RESET}`);
  const responses = await Promise.all(txPromises);
  const receiptPromises = responses.map(res => res.wait());
  await Promise.all(receiptPromises);
  console.log(`  ${GREEN}Confirmed: ${description} for ${txPromises.length} users.${RESET}`);
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
  for (let i = 0; i < TX_COUNT; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, TX_COUNT);
    console.log(`\n${BLUE}--- Processing user chunk: ${i} to ${chunkEnd - 1} ---${RESET}`);

    const currentChunkWallets = userWallets.slice(i, chunkEnd);
    const swapPromises = [];

    // Prepare all approve and swap transactions for the current chunk
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenInAddress = tokenAddresses[2 * m];
      const tokenOutAddress = tokenAddresses[2 * m + 1];

      let nonce = nonceTrackers.get(userWallet.address);

      // Prepare swap transaction
      const routerContract = new Contract(uniswapAddresses.router, routerAbi, userWallet);
      const path = [tokenInAddress, tokenOutAddress];
      const to = userWallet.address;

      swapPromises.push(
        routerContract.swapExactTokensForTokens(
          SWAP_AMOUNT_IN,
          AMOUNT_OUT_MIN,
          path,
          to,
          DEADLINE,
          { nonce: nonce++ } // Use the next nonce
        )
      );

      nonceTrackers.set(userWallet.address, nonce); // Update nonce tracker
    }

    // Execute batches sequentially for the current chunk
    await executeBatch("Executing Swaps", swapPromises);
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