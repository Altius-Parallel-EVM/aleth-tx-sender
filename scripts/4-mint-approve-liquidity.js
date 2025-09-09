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
  // Execute in smaller sub-chunks to avoid overwhelming the node if the batch is huge
  const subChunkSize = 1000;
  for (let i = 0; i < txPromises.length; i += subChunkSize) {
    const subChunk = txPromises.slice(i, i + subChunkSize);
    const responses = await Promise.all(subChunk);
    const receiptPromises = responses.map(res => res.wait());
    await Promise.all(receiptPromises);
    console.log(`    ...confirmed ${i + subChunk.length}/${txPromises.length}`);
  }
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

  // 2. Prepare ALL users for potential conflicts in Pool 0
  console.log(`\n${BLUE}--- Preparing ALL ${TX_COUNT} users for conflicts in Pool 0 ---${RESET}`);
  const token0Address = tokenAddresses[0];
  const token0Contract = new Contract(token0Address, tokenAbi, provider);

  // All users mint Token 0
  let mintPromises = [];
  for (const userWallet of userWallets) {
    let nonce = await provider.getTransactionCount(userWallet.address);
    mintPromises.push(token0Contract.connect(userWallet).mint({ nonce: nonce }));
  }
  await executeBatch(`All ${TX_COUNT} users minting Token 0`, mintPromises);

  // All users approve Token 0 for the Router
  let approvePromises = [];
  for (const userWallet of userWallets) {
    let nonce = await provider.getTransactionCount(userWallet.address);
    approvePromises.push(token0Contract.connect(userWallet).approve(uniswapAddresses.router, APPROVE_AMOUNT, { nonce: nonce }));
  }
  await executeBatch(`All ${TX_COUNT} users approving Token 0 for Router`, approvePromises);
  console.log(`${GREEN}All users are now prepared for Pool 0 swaps.${RESET}`);


  // 3. Fetch initial nonces for the main liquidity task
  console.log(`\nFetching initial nonces for all ${TX_COUNT} user wallets for their individual pools...`);
  const nonceTrackers = new Map();
  const noncePromises = userWallets.map(async (wallet) => {
    const nonce = await provider.getTransactionCount(wallet.address);
    nonceTrackers.set(wallet.address, nonce);
  });
  await Promise.all(noncePromises);
  console.log(`${GREEN}Initial nonces fetched.${RESET}`);

  // 4. Process users in chunks to add liquidity to their individual pools
  console.log(`\n${BLUE}--- Starting Main Liquidity Provision for all ${TX_COUNT} individual pools ---${RESET}`);
  for (let i = 0; i < TX_COUNT; i += CHUNK_SIZE) {
    const chunkEnd = Math.min(i + CHUNK_SIZE, TX_COUNT);
    console.log(`\n${BLUE}--- Processing user chunk for liquidity: ${i} to ${chunkEnd - 1} ---${RESET}`);
    const currentChunkWallets = userWallets.slice(i, chunkEnd);

    // The following logic is now correctly sequential to ensure proper nonce handling
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
    await executeBatch("Minting for Token A", mintAPromises);

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
    await executeBatch("Minting for Token B", mintBPromises);

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
    await executeBatch("Approving Router for Token A", approveAPromises);

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
    await executeBatch("Approving Router for Token B", approveBPromises);

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
    await executeBatch("Adding Liquidity", addLiquidityPromises);
  }

  console.log(`\n\n${GREEN}--- All liquidity provisioning and preparations are complete! ---${RESET}`);
}

main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});