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
const CHUNK_SIZE = 250;

// --- Transaction Parameters ---
const APPROVE_AMOUNT = parseUnits("1000000", 18);
const LIQUIDITY_AMOUNT = parseUnits("10000", 18);
const DEADLINE = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;

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

  const { abi: tokenAbi } = loadContract('musdc');
  const { abi: routerAbi } = loadContract('univ2-router');

  const userWallets = userWalletsInfo.map(info => new Wallet(info.privateKey, provider));

  // NEW: Full preparation for the conflict user (user[0])
  console.log(`\n${BLUE}--- Preparing user[0] for ALL ${TX_COUNT} potential swaps ---${RESET}`);
  const conflictUser = userWallets[0];

  // Mint all 1000 necessary input tokens for user[0]
  let prepNonceMint = await provider.getTransactionCount(conflictUser.address);
  const mintPromises = [];
  for (let m = 0; m < TX_COUNT; m++) {
    const tokenInAddress = tokenAddresses[2 * m];
    const tokenContract = new Contract(tokenInAddress, tokenAbi, conflictUser);
    mintPromises.push(tokenContract.mint({ nonce: prepNonceMint++ }));
  }
  await executeBatch(`Minting all 1000 input tokens for user 0`, mintPromises);

  // Approve all 1000 necessary input tokens for user[0]
  let prepNonceApprove = await provider.getTransactionCount(conflictUser.address); // Re-fetch nonce after minting
  const approvePromises = [];
  for (let m = 0; m < TX_COUNT; m++) {
    const tokenInAddress = tokenAddresses[2 * m];
    const tokenContract = new Contract(tokenInAddress, tokenAbi, conflictUser);
    approvePromises.push(tokenContract.approve(uniswapAddresses.router, APPROVE_AMOUNT, { nonce: prepNonceApprove++ }));
  }
  await executeBatch(`Approving all 1000 input tokens for user 0`, approvePromises);
  console.log(`${GREEN}user[0] is now fully prepared.${RESET}`);


  // 2. Prepare wallets and fetch nonces for the main liquidity task
  console.log(`\nFetching initial nonces for all ${TX_COUNT} user wallets for liquidity provision...`);
  const nonceTrackers = new Map();
  const noncePromises = userWallets.map(async (wallet) => {
    const nonce = await provider.getTransactionCount(wallet.address);
    nonceTrackers.set(wallet.address, nonce);
  });
  await Promise.all(noncePromises);
  console.log(`${GREEN}Initial nonces fetched.${RESET}`);

  // 3. Process users in chunks for liquidity provision (same as before)
  console.log(`\n${BLUE}--- Starting Main Liquidity Provision for all users ---${RESET}`);
  for (let i = 0; i < TX_COUNT; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, TX_COUNT);
    console.log(`\n${BLUE}--- Processing user chunk for liquidity: ${i} to ${chunkEnd - 1} ---${RESET}`);
    const currentChunkWallets = userWallets.slice(i, chunkEnd);

    // BATCH 1: MINT A
    const mintAPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenAAddress = tokenAddresses[2 * m];
      const tokenAContract = new Contract(tokenAAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      mintAPromises.push(tokenAContract.mint({ nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // BATCH 2: MINT B
    const mintBPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenBAddress = tokenAddresses[2 * m + 1];
      const tokenBContract = new Contract(tokenBAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      mintBPromises.push(tokenBContract.mint({ nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // BATCH 3: APPROVE A
    const approveAPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenAAddress = tokenAddresses[2 * m];
      const tokenAContract = new Contract(tokenAAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      approveAPromises.push(tokenAContract.approve(uniswapAddresses.router, APPROVE_AMOUNT, { nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // BATCH 4: APPROVE B
    const approveBPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenBAddress = tokenAddresses[2 * m + 1];
      const tokenBContract = new Contract(tokenBAddress, tokenAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      approveBPromises.push(tokenBContract.approve(uniswapAddresses.router, APPROVE_AMOUNT, { nonce: nonce }));
      nonceTrackers.set(userWallet.address, nonce + 1);
    }

    // BATCH 5: ADD LIQUIDITY
    const addLiquidityPromises = [];
    for (const userWallet of currentChunkWallets) {
      const m = userWallets.indexOf(userWallet);
      const tokenAAddress = tokenAddresses[2 * m];
      const tokenBAddress = tokenAddresses[2 * m + 1];
      const routerContract = new Contract(uniswapAddresses.router, routerAbi, userWallet);
      let nonce = nonceTrackers.get(userWallet.address);
      addLiquidityPromises.push(
        routerContract.addLiquidity(
          tokenAAddress, tokenBAddress, LIQUIDITY_AMOUNT, LIQUIDITY_AMOUNT, 0, 0, userWallet.address, DEADLINE,
          { nonce: nonce, gasLimit: 3000000 }
        )
      );
      nonceTrackers.set(userWallet.address, nonce + 1);
    }
    
    await executeBatch("Minting for Token A", mintAPromises);
    await executeBatch("Minting for Token B", mintBPromises);
    await executeBatch("Approving Router for Token A", approveAPromises);
    await executeBatch("Approving Router for Token B", approveBPromises);
    await executeBatch("Adding Liquidity", addLiquidityPromises);
  }

  console.log(`\n\n${GREEN}--- All liquidity provisioning tasks are complete! ---${RESET}`);
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});